#!/usr/bin/env python3
"""Hydro-Québec bridge process.

Thin adapter around the community-maintained `hydroqc` library
(https://gitlab.com/hydroqc/hydroqc, PyPI: Hydro-Quebec-API-Wrapper) — the
same library Home Assistant's `hydroqc-ha` integration is built on. This
process owns NOTHING Hydro-Québec-specific itself: authentication, contract
discovery, consumption figures, and the Winter Credit (CPC) / Flex D (DPC)
peak-calendar math are all `hydroqc`'s own code. This script only:

  1. speaks a tiny line-delimited JSON protocol on stdin/stdout so the Node.js
     side (which owns the actual Gladys Assistant SDK connection) can drive it;
  2. keeps one logged-in `WebUser` (and the discovered customer/account/
     contract tree it builds) alive across calls, since re-logging in on every
     poll would be wasteful and hydroqc already handles token refresh itself;
  3. flattens hydroqc's object properties into plain JSON for each command.

Protocol: one JSON object per line on stdin, e.g. {"id": 1, "cmd": "discover",
"username": "...", "password": "..."}. One JSON object per line on stdout,
either {"id": 1, "ok": true, "result": ...} or {"id": 1, "ok": false, "error": "..."}.
All logging goes to stderr - stdout is reserved for protocol responses only.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
import traceback
from datetime import datetime
from typing import Any

# hydroqc computes "now" as the system's LOCAL wall clock labelled as Eastern
# time (hydroqc.utils.now: EST_TIMEZONE.localize(datetime.now())). In a
# container left on UTC - the Docker default - every peak state, pre-heat
# window and "today/tomorrow" lookup was therefore 4 hours off (5 in winter).
# Pin this process to Eastern time before anything reads the clock. A POSIX TZ
# string, not "America/Toronto": the Alpine image ships no tzdata database,
# and musl/glibc both understand this form without one.
os.environ["TZ"] = "EST5EDT,M3.2.0,M11.1.0"
time.tzset()

from hydroqc import utils as hq_utils  # noqa: E402 - must follow the TZ pin above
from hydroqc.contract import ContractDCPC, ContractDPC  # noqa: E402
from hydroqc.error import HydroQcError  # noqa: E402
from hydroqc.types import OutageStatus  # noqa: E402
from hydroqc.webuser import WebUser  # noqa: E402

logging.basicConfig(
    stream=sys.stderr,
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("hq_bridge")

# Outage states considered "in progress" for the power_outage sensor. hydroqc
# does not document these HQ-internal codes further than the enum names below.
ACTIVE_OUTAGE_STATUSES = {OutageStatus.courante_confirme, OutageStatus.non_confirme}

# Upper bound on the upcoming critical peaks returned per contract: a winter
# has at most ~30 critical events (120 h of Flex D peaks, 4 h each).
MAX_SCHEDULED_PEAKS = 40


class BridgeState:
    """Holds the single logged-in WebUser and the discovered contract tree."""

    def __init__(self) -> None:
        self.username: str | None = None
        self.password: str | None = None
        self.webuser: WebUser | None = None
        # contract_id -> (contract, account, customer)
        self.contracts_by_id: dict[str, tuple[Any, Any, Any]] = {}

    async def get_webuser(self, username: str, password: str, *, force_login: bool = False) -> WebUser:
        if not force_login and self.webuser is not None and self.username == username and self.password == password:
            return self.webuser
        logger.info("Logging in to Hydro-Québec as %s", username)
        webuser = WebUser(username, password, verify_ssl=True)
        try:
            await webuser.login()
        except Exception:
            # Avoid leaking the aiohttp session/connector on a failed login
            # (e.g. a wrong password retried through the "Test the connection" action).
            await webuser.close_session()
            raise
        if self.webuser is not None:
            # Replacing a previous session (credentials changed, or a forced re-login).
            await self.webuser.close_session()
        self.username = username
        self.password = password
        self.webuser = webuser
        self.contracts_by_id = {}
        return webuser


state = BridgeState()
# All three commands mutate/read the single WebUser's shared HydroClient
# (session cookies, "currently selected contract" on the portal, token
# refresh state): running two of them concurrently would let one command's
# portal-session switch corrupt another's in-flight request. Node normally
# only has one call in flight at a time, but this lock makes that a
# guarantee of the protocol itself rather than an assumption about the caller.
hydroqc_lock = asyncio.Lock()


def serialize_contract(contract: Any, account: Any, customer: Any) -> dict[str, Any]:
    return {
        "applicant_id": customer.applicant_id,
        "customer_id": customer.customer_id,
        "customer_names": customer.names,
        "account_id": account.account_id,
        "contract_id": contract.contract_id,
        "rate": contract.rate,
        "rate_option": contract.rate_option,
        "address": contract.address,
    }


async def cmd_login(params: dict[str, Any]) -> dict[str, Any]:
    await state.get_webuser(params["username"], params["password"], force_login=True)
    return {"success": True}


async def cmd_discover(params: dict[str, Any]) -> list[dict[str, Any]]:
    webuser = await state.get_webuser(params["username"], params["password"])
    await webuser.get_info()
    await webuser.fetch_customers_info()

    contracts = []
    state.contracts_by_id = {}
    for customer in webuser.customers:
        for account in customer.accounts:
            for contract in account.contracts:
                state.contracts_by_id[contract.contract_id] = (contract, account, customer)
                contracts.append(serialize_contract(contract, account, customer))
    logger.info("Discovered %d contract(s)", len(contracts))
    return contracts


def get_contract_entry(params: dict[str, Any]) -> tuple[Any, Any, Any]:
    contract_id = params["contract_id"]
    entry = state.contracts_by_id.get(contract_id)
    if entry is None:
        raise HydroQcError(f"Unknown contract {contract_id}: call discover first")
    contract = entry[0]
    preheat_duration_minutes = params.get("preheat_duration_minutes")
    if preheat_duration_minutes is not None and hasattr(contract, "set_preheat_duration"):
        contract.set_preheat_duration(int(preheat_duration_minutes))
    return entry


def day_start(value: Any) -> str | None:
    """ISO timestamp of the local (Eastern) midnight starting a "YYYY-MM-DD..." day."""
    try:
        day = datetime.strptime(str(value)[:10], "%Y-%m-%d")
    except ValueError:
        return None
    return hq_utils.EST_TIMEZONE.localize(day).isoformat()


def latest_daily_consumption(daily: dict[str, Any]) -> dict[str, Any]:
    """The most recent day that has a consumption figure in a daily-consumption payload.

    get_today_daily_consumption() asks for [yesterday, today], and Hydro-Québec
    publishes a day 1 to 2 days late: the answer holds 0 to 2 days, in no
    documented order, so pick the latest dated one instead of the first.
    """
    days = [(r or {}).get("courant") or {} for r in daily.get("results") or []]
    days = [d for d in days if d.get("consoTotalQuot") is not None]
    if not days:
        return {}
    return max(days, key=lambda d: str(d.get("dateJourConso") or ""))


def peak_schedule(peaks: list[Any], now: datetime) -> list[dict[str, Any]]:
    """Critical peaks not over yet, soonest first, with their pre-heat start."""
    upcoming = sorted((p for p in peaks if p.end_date > now), key=lambda p: p.start_date)
    return [
        {
            "start": p.start_date.isoformat(),
            "end": p.end_date.isoformat(),
            "preheat_start": p.preheat.start_date.isoformat(),
            "period": p.morning_evening,
        }
        for p in upcoming[:MAX_SCHEDULED_PEAKS]
    ]


def cpc_peak_state(peak_handler: Any) -> dict[str, Any]:
    """Time-dependent Winter Credit state, computed from already-fetched data (no HTTP)."""
    now = hq_utils.now()
    next_critical = peak_handler.next_critical_peak
    return {
        "current_state": peak_handler.current_state,
        "critical_peak_coming": next_critical is not None,
        # Not peak_handler.preheat_in_progress: for Winter Credit that one
        # follows the next peak of the daily schedule, critical or not, so it
        # would turn on before every morning and evening peak of the winter.
        # The sensor is documented as the pre-heat before a CRITICAL peak.
        "preheat_in_progress": bool(
            next_critical and next_critical.preheat.start_date < now < next_critical.preheat.end_date
        ),
        "critical_peak_in_progress": peak_handler.current_state == "critical_peak",
        "critical_peaks": peak_schedule(peak_handler.critical_peaks, now),
    }


def dpc_peak_state(peak_handler: Any) -> dict[str, Any]:
    """Time-dependent Flex D state (every Flex D peak is a critical one), no HTTP."""
    now = hq_utils.now()
    return {
        "current_state": peak_handler.current_state,
        "peak_in_progress": peak_handler.peak_in_progress,
        "preheat_in_progress": peak_handler.preheat_in_progress,
        "critical_peaks": peak_schedule(peak_handler.peaks, now),
    }


async def cmd_peaks(params: dict[str, Any]) -> dict[str, Any]:
    """Re-evaluate a contract's peak states now, optionally re-reading the open data first.

    Cheap by design: no portal request (the Winter Credit's own peak data comes
    from the last `poll`), at most one request to Hydro-Québec's public,
    unauthenticated open-data feed of peak events. Called at the exact instants
    a peak or pre-heat starts or ends, and every 15 minutes while Hydro-Québec
    announces the next day's peaks.
    """
    contract = get_contract_entry(params)[0]
    refresh_open_data = bool(params.get("refresh_open_data"))
    result: dict[str, Any] = {"cpc": None, "dpc": None}
    if isinstance(contract, ContractDCPC):
        if refresh_open_data:
            await contract.peak_handler.refresh_open_data()
        result["cpc"] = cpc_peak_state(contract.peak_handler)
    if isinstance(contract, ContractDPC):
        if refresh_open_data:
            await contract.peak_handler.refresh_open_data()
        result["dpc"] = dpc_peak_state(contract.peak_handler)
    return result


async def cmd_poll(params: dict[str, Any]) -> dict[str, Any]:
    contract_id = params["contract_id"]
    contract, account, _customer = get_contract_entry(params)

    # hydroqc's HydroClient is shared by every contract under one logged-in
    # WebUser, and its _select_contract() (called internally by both
    # get_periods_info() and get_today_daily_consumption() below) only
    # re-navigates the Hydro-Québec portal to the requested contract when
    # its *web session* has expired - it does NOT check whether the
    # currently selected contract is actually this one
    # (hydro_api/client.py: `if self.web_session_expiry > datetime.now(): return`).
    # On an account with several contracts (e.g. a secondary meter under the
    # same subscription), polling contract B shortly after contract A - the
    # normal case, since pollAllContracts() loops over every contract every
    # cycle - reuses A's still-fresh web session and silently returns A's
    # consumption data mislabeled as B's, with no error at all. Forcing the
    # session stale here whenever the selected contract differs makes
    # hydroqc actually reselect before fetching this contract's data.
    hydro_client = contract._hydro_client  # noqa: SLF001 - no public API for this
    if hydro_client.selected_contract != contract_id:
        hydro_client.web_session_expiry = datetime.min

    await account.get_info()

    # Some contracts (e.g. a newly opened service, or a secondary/water-heater
    # meter) have no current billing period yet on Hydro-Québec's side -
    # get_periods_info() then raises HydroQcError("No period found..."). That
    # must not take down the whole poll: consumption, temperature, balance
    # and outage status below are all independent of period data. Only the
    # daily cost mean (which is derived from the current period) is skipped.
    daily_cost_mean = None
    try:
        await contract.get_periods_info()
        daily_cost_mean = contract.cp_daily_bill_mean
    except HydroQcError as exc:
        logger.warning("No billing period data for contract %s (%s), daily cost unavailable", contract_id, exc)

    daily = await contract.get_today_daily_consumption()
    await contract.refresh_outages()

    latest_day = latest_daily_consumption(daily)

    result: dict[str, Any] = {
        "rate": contract.rate,
        "rate_option": contract.rate_option,
        "balance": account.balance,
        "daily_consumption_kwh": latest_day.get("consoTotalQuot"),
        "avg_temperature": latest_day.get("tempMoyenneQuot"),
        # The day those two figures are about (not the day of this poll):
        # local midnight starting it, or None if Hydro-Québec gave no date.
        "daily_consumption_at": day_start(latest_day.get("dateJourConso")),
        "daily_cost_mean": daily_cost_mean,
        "outage_active": any(o.status in ACTIVE_OUTAGE_STATUSES for o in contract.outages),
        "cpc": None,
        "dpc": None,
    }

    if isinstance(contract, ContractDCPC):
        peak_handler = contract.peak_handler
        await peak_handler.refresh_data()
        await peak_handler.refresh_open_data()
        result["cpc"] = {
            "cumulated_credit": peak_handler.cumulated_credit,
            "projected_cumulated_credit": peak_handler.projected_cumulated_credit,
            **cpc_peak_state(peak_handler),
        }

    if isinstance(contract, ContractDPC):
        await contract.get_dpc_data()
        peak_handler = contract.peak_handler
        await peak_handler.refresh_open_data()
        result["dpc"] = {
            "critical_called_hours": contract.critical_called_hours,
            "amount_saved_vs_base_rate": contract.amount_saved_vs_base_rate,
            **dpc_peak_state(peak_handler),
        }

    return result


COMMANDS = {"login": cmd_login, "discover": cmd_discover, "poll": cmd_poll, "peaks": cmd_peaks}


async def handle_request(line: str) -> None:
    try:
        request = json.loads(line)
    except json.JSONDecodeError as exc:
        logger.error("Bad JSON on stdin: %s", exc)
        return

    request_id = request.get("id")
    cmd = request.get("cmd")
    handler = COMMANDS.get(cmd)
    response: dict[str, Any]
    if handler is None:
        response = {"id": request_id, "ok": False, "error": f"Unknown command {cmd!r}"}
    else:
        try:
            async with hydroqc_lock:
                result = await handler(request)
            response = {"id": request_id, "ok": True, "result": result}
        except Exception as exc:  # noqa: BLE001 - relayed to Node as a plain error string
            logger.error("Command %s failed: %s\n%s", cmd, exc, traceback.format_exc())
            response = {"id": request_id, "ok": False, "error": str(exc)}

    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()


async def main() -> None:
    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    logger.info("Hydro-Québec bridge ready")
    # Tracked so stdin closing doesn't cut off a response that's still being
    # computed (Node normally keeps stdin open for the container's whole
    # life, but a manual `echo ... | docker run ...` test closes it as soon
    # as the last line is written).
    pending_tasks: set[asyncio.Task[None]] = set()
    while True:
        line = await reader.readline()
        if not line:
            break
        stripped = line.decode("utf-8").strip()
        if not stripped:
            continue
        # Fire-and-forget: requests are already serialized on the Node side,
        # but running each in its own task avoids one slow command blocking
        # stdin readline processing of the next one.
        task = asyncio.create_task(handle_request(stripped))
        pending_tasks.add(task)
        task.add_done_callback(pending_tasks.discard)

    if pending_tasks:
        logger.info("stdin closed with %d request(s) still in flight, waiting...", len(pending_tasks))
        await asyncio.gather(*pending_tasks, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
