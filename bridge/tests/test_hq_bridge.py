"""Unit tests for bridge/hq_bridge.py, against real hydroqc objects.

No Hydro-Québec account involved: the peak handlers are fed their open-data
payload directly, and the clock hydroqc reads (hydroqc.utils.now) is pinned.
"""

from __future__ import annotations

import asyncio
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


def hourly_rows(hours: list[str], kwh: float = 1.0) -> list[dict[str, object]]:
    return [{"heure": hour, "consoTotal": kwh} for hour in hours]


def test_hours_in_day_follows_daylight_saving() -> None:
    assert hq_bridge.hours_in_day(datetime.date(2026, 1, 12)) == 24
    assert hq_bridge.hours_in_day(datetime.date(2026, 3, 8)) == 23
    assert hq_bridge.hours_in_day(datetime.date(2026, 11, 1)) == 25


def test_hourly_intervals_split_each_hour_in_two_utc_halves() -> None:
    day = datetime.date(2026, 1, 12)
    result = hq_bridge.hourly_intervals(day, hourly_rows([f"{h:02d}:00:00" for h in range(24)], 1.5))
    assert result["complete"] is True
    assert len(result["intervals"]) == 48
    # Local midnight in winter is 05:00 UTC.
    assert result["intervals"][0] == {"starts_at": "2026-01-12T05:00:00Z", "kwh": 0.75}
    assert result["intervals"][1] == {"starts_at": "2026-01-12T05:30:00Z", "kwh": 0.75}
    # The 06:00-10:00 Flex D peak lands on whole slots: 11:00Z to 15:00Z.
    assert result["intervals"][12]["starts_at"] == "2026-01-12T11:00:00Z"
    assert sum(i["kwh"] for i in result["intervals"]) == pytest.approx(36)


def test_hourly_intervals_on_the_autumn_change_keep_both_one_oclock_hours() -> None:
    day = datetime.date(2026, 11, 1)
    hours = ["00:00:00", "01:00:00", "01:00:00"] + [f"{h:02d}:00:00" for h in range(2, 24)]
    result = hq_bridge.hourly_intervals(day, hourly_rows(hours))
    assert result["complete"] is True
    starts = [i["starts_at"] for i in result["intervals"]]
    assert len(starts) == 50 and len(set(starts)) == 50
    # 01:00 EDT (05:00Z), then 01:00 EST (06:00Z).
    assert starts[2:6] == [
        "2026-11-01T05:00:00Z",
        "2026-11-01T05:30:00Z",
        "2026-11-01T06:00:00Z",
        "2026-11-01T06:30:00Z",
    ]


def test_hourly_intervals_on_the_spring_change_have_23_hours() -> None:
    day = datetime.date(2026, 3, 8)
    hours = ["00:00:00", "01:00:00"] + [f"{h:02d}:00:00" for h in range(3, 24)]
    result = hq_bridge.hourly_intervals(day, hourly_rows(hours))
    assert result["complete"] is True
    assert result["intervals"][4]["starts_at"] == "2026-03-08T07:00:00Z"  # 03:00 EDT


def test_hourly_intervals_skip_missing_hours_and_flag_the_day_incomplete() -> None:
    day = datetime.date(2026, 1, 12)
    rows = hourly_rows([f"{h:02d}:00:00" for h in range(24)])
    rows[5]["consoTotal"] = None
    rows[6]["heure"] = ""
    result = hq_bridge.hourly_intervals(day, rows)
    assert result["complete"] is False
    assert len(result["intervals"]) == 44
    assert hq_bridge.hourly_intervals(day, hourly_rows(["00:00:00"]))["complete"] is False


def test_flex_d_events_keep_the_flex_d_offer_in_utc() -> None:
    events = [
        open_data_event("CPC-D", at(datetime.date(2026, 1, 12), 6), at(datetime.date(2026, 1, 12), 10)),
        open_data_event("TPC-DPC", at(datetime.date(2026, 1, 13), 16), at(datetime.date(2026, 1, 13), 20)),
        open_data_event("TPC-DPC", at(datetime.date(2026, 1, 12), 6), at(datetime.date(2026, 1, 12), 10)),
        {"offre": "TPC-DPC", "dateDebut": "not a date", "dateFin": "2026-01-12T10:00:00-05:00"},
        {"offre": "TPC-DPC", "dateDebut": "2026-01-12T10:00:00", "dateFin": "2026-01-12T12:00:00"},
        {"offre": "TPC-DPC", "dateDebut": "2026-01-12T10:00:00-05:00", "dateFin": "2026-01-12T12:00:00"},
        {"offre": "TPC-DPC", "dateFin": "2026-01-12T12:00:00-05:00"},
    ]
    assert hq_bridge.flex_d_events(events) == [
        {"start": "2026-01-12T11:00:00Z", "end": "2026-01-12T15:00:00Z"},
        {"start": "2026-01-13T21:00:00Z", "end": "2026-01-14T01:00:00Z"},
    ]


class FakeHourlyContract:
    """Just what cmd_hourly touches on a hydroqc contract."""

    contract_id = "c1"

    def __init__(self, by_day: dict[datetime.date, object]) -> None:
        self.by_day = by_day
        self._hydro_client = type("Client", (), {"selected_contract": "c1"})()

    async def get_hourly_consumption(self, day: datetime.date) -> object:
        value = self.by_day[day]
        if isinstance(value, Exception):
            raise value
        return value


def test_cmd_hourly_reports_days_without_data_as_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    day1, day2 = datetime.date(2026, 1, 11), datetime.date(2026, 1, 12)
    contract = FakeHourlyContract(
        {
            day1: {"results": {"listeDonneesConsoEnergieHoraire": hourly_rows([f"{h:02d}:00:00" for h in range(24)])}},
            day2: hq_bridge.HydroQcHTTPError("No data available for date 2026-01-12"),
        }
    )
    monkeypatch.setattr(hq_bridge.state, "contracts_by_id", {"c1": (contract, None, None)})
    result = asyncio.run(hq_bridge.cmd_hourly({"contract_id": "c1", "dates": ["2026-01-11", "2026-01-12"]}))
    assert [d["date"] for d in result["days"]] == ["2026-01-11", "2026-01-12"]
    assert result["days"][0]["complete"] is True and len(result["days"][0]["intervals"]) == 48
    assert result["days"][1] == {"date": "2026-01-12", "complete": False, "intervals": []}

    contract.by_day[day2] = hq_bridge.HydroQcHTTPError("HTTP 500")
    with pytest.raises(hq_bridge.HydroQcHTTPError):
        asyncio.run(hq_bridge.cmd_hourly({"contract_id": "c1", "dates": ["2026-01-12"]}))
