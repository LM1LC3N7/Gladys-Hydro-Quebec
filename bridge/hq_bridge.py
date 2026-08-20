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
import traceback
from typing import Any

from hydroqc.contract import ContractDCPC, ContractDPC
from hydroqc.error import HydroQcError
from hydroqc.types import OutageStatus
from hydroqc.webuser import WebUser

logging.basicConfig(
    stream=sys.stderr,
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("hq_bridge")

# Outage states considered "in progress" for the power_outage sensor. hydroqc
# does not document these HQ-internal codes further than the enum names below.
ACTIVE_OUTAGE_STATUSES = {OutageStatus.courante_confirme, OutageStatus.non_confirme}


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


async def cmd_poll(params: dict[str, Any]) -> dict[str, Any]:
    contract_id = params["contract_id"]
    entry = state.contracts_by_id.get(contract_id)
    if entry is None:
        raise HydroQcError(f"Unknown contract {contract_id}: call discover first")
    contract, account, _customer = entry

    await account.get_info()
    await contract.get_periods_info()
    daily = await contract.get_today_daily_consumption()
    await contract.refresh_outages()

    daily_results = daily.get("results") or []
    daily_today = daily_results[0]["courant"] if daily_results else {}

    result: dict[str, Any] = {
        "rate": contract.rate,
        "rate_option": contract.rate_option,
        "balance": account.balance,
        "daily_consumption_kwh": daily_today.get("consoTotalQuot"),
        "avg_temperature": daily_today.get("tempMoyenneQuot"),
        "daily_cost_mean": contract.cp_daily_bill_mean,
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
            "current_state": peak_handler.current_state,
            "critical_peak_coming": peak_handler.is_any_critical_peak_coming,
            "preheat_in_progress": peak_handler.preheat_in_progress,
        }

    if isinstance(contract, ContractDPC):
        await contract.get_dpc_data()
        peak_handler = contract.peak_handler
        await peak_handler.refresh_open_data()
        result["dpc"] = {
            "current_state": peak_handler.current_state,
            "peak_in_progress": peak_handler.peak_in_progress,
            "preheat_in_progress": peak_handler.preheat_in_progress,
            "critical_called_hours": contract.critical_called_hours,
            "amount_saved_vs_base_rate": contract.amount_saved_vs_base_rate,
        }

    return result


COMMANDS = {"login": cmd_login, "discover": cmd_discover, "poll": cmd_poll}


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
