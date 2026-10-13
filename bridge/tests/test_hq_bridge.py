"""Unit tests for bridge/hq_bridge.py, against real hydroqc objects.

No Hydro-Québec account involved: the peak handlers are fed their open-data
payload directly, and the clock hydroqc reads (hydroqc.utils.now) is pinned.
"""

from __future__ import annotations

import datetime
import logging
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import hq_bridge
from hydroqc import utils as hq_utils
from hydroqc.peak.cpc.handler import CPCPeakHandler
from hydroqc.peak.dpc.handler import DPCPeakHandler

EST = hq_utils.EST_TIMEZONE
LOGGER = logging.getLogger("test")


def at(day: datetime.date, hour: int, minute: int = 0) -> datetime.datetime:
    return EST.localize(datetime.datetime.combine(day, datetime.time(hour, minute)))


def open_data_event(offer: str, start: datetime.datetime, end: datetime.datetime) -> dict[str, str]:
    return {"offre": offer, "dateDebut": start.isoformat(), "dateFin": end.isoformat()}


def pin_now(monkeypatch: pytest.MonkeyPatch, now: datetime.datetime) -> None:
    monkeypatch.setattr(hq_utils, "now", lambda: now)


def test_bridge_pins_its_clock_to_eastern_time() -> None:
    # hydroqc.utils.now() labels the LOCAL wall clock as Eastern time: on a
    # UTC container it was 4-5 hours off until the bridge pinned TZ.
    assert os.environ["TZ"] == "EST5EDT,M3.2.0,M11.1.0"
    real = datetime.datetime.now(datetime.UTC).astimezone(EST)
    assert abs(hq_utils.now() - real) < datetime.timedelta(minutes=1)


def test_day_start_is_the_local_midnight_of_the_day() -> None:
    assert hq_bridge.day_start("2026-01-12") == "2026-01-12T00:00:00-05:00"
    assert hq_bridge.day_start("2026-07-01T00:00:00.000") == "2026-07-01T00:00:00-04:00"
    assert hq_bridge.day_start(None) is None
    assert hq_bridge.day_start("12/01/2026") is None


def test_latest_daily_consumption_picks_the_latest_dated_day() -> None:
    def day(date: str, kwh: float | None) -> dict[str, dict[str, object]]:
        return {"courant": {"dateJourConso": date, "consoTotalQuot": kwh, "tempMoyenneQuot": -5}}

    payload = {"results": [day("2026-01-11", 40.5), day("2026-01-12", 52.0), day("2026-01-13", None)]}
    assert hq_bridge.latest_daily_consumption(payload)["dateJourConso"] == "2026-01-12"
    assert hq_bridge.latest_daily_consumption({"results": []}) == {}
    assert hq_bridge.latest_daily_consumption({}) == {}


@pytest.fixture
def cpc_handler() -> tuple[CPCPeakHandler, datetime.date]:
    handler = CPCPeakHandler("app", "cust", contract_id="c1", hydro_client=None, logger=LOGGER)
    handler.set_preheat_duration(180)
    # A day well inside the winter hydroqc computes from today's date.
    day = handler.winter_start_date.date() + datetime.timedelta(days=14)
    handler._raw_open_data = [open_data_event("CPC-D", at(day, 16), at(day, 20))]  # noqa: SLF001
    return handler, day


def test_cpc_preheat_only_runs_before_critical_peaks(monkeypatch: pytest.MonkeyPatch, cpc_handler) -> None:
    handler, day = cpc_handler

    # 04:00: inside the pre-heat window of that day's NON-critical morning peak.
    pin_now(monkeypatch, at(day, 4))
    assert handler.preheat_in_progress is True  # hydroqc's own reading: any next peak
    state = hq_bridge.cpc_peak_state(handler)
    assert state["preheat_in_progress"] is False
    assert state["critical_peak_coming"] is True

    # 14:00: inside the pre-heat window (13:00-16:00) of the critical evening peak.
    pin_now(monkeypatch, at(day, 14))
    assert hq_bridge.cpc_peak_state(handler)["preheat_in_progress"] is True

    # 17:00: during the critical peak.
    pin_now(monkeypatch, at(day, 17))
    state = hq_bridge.cpc_peak_state(handler)
    assert state["current_state"] == "critical_peak"
    assert state["critical_peak_in_progress"] is True
    assert state["preheat_in_progress"] is False


def test_cpc_schedule_lists_upcoming_critical_peaks(monkeypatch: pytest.MonkeyPatch, cpc_handler) -> None:
    handler, day = cpc_handler
    pin_now(monkeypatch, at(day, 8))
    assert hq_bridge.cpc_peak_state(handler)["critical_peaks"] == [
        {
            "start": at(day, 16).isoformat(),
            "end": at(day, 20).isoformat(),
            "preheat_start": at(day, 13).isoformat(),
            "period": "evening",
        }
    ]
    pin_now(monkeypatch, at(day, 21))
    assert hq_bridge.cpc_peak_state(handler)["critical_peaks"] == []


def test_dpc_state_and_schedule(monkeypatch: pytest.MonkeyPatch) -> None:
    handler = DPCPeakHandler("app", "cust", contract_id="c2", hydro_client=None, logger=LOGGER)
    handler.set_preheat_duration(60)
    day = datetime.date(2027, 1, 20)
    handler._raw_open_data = [open_data_event("TPC-DPC", at(day, 6), at(day, 10))]  # noqa: SLF001

    pin_now(monkeypatch, at(day, 5, 30))
    state = hq_bridge.dpc_peak_state(handler)
    assert state["preheat_in_progress"] is True
    assert state["peak_in_progress"] is False
    assert state["critical_peaks"][0]["preheat_start"] == at(day, 5).isoformat()
    assert state["critical_peaks"][0]["period"] == "morning"

    pin_now(monkeypatch, at(day, 7))
    state = hq_bridge.dpc_peak_state(handler)
    assert state["current_state"] == "peak"
    assert state["peak_in_progress"] is True
