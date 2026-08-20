// -----------------------------------------------------------------------------
// Winter Credit (CPC) and Flex D (DPC) peak-event logic.
//
// Ported from hydroqc's `hydroqc.peak` package (basepeak.py, basepeakhandler.py,
// peak/cpc/*.py, peak/dpc/*.py). Hydro-Québec's raw APIs only expose winter-wide
// summaries and confirmed critical-peak stats: hydroqc reconstructs the full
// peak calendar itself (every morning/evening slot of the winter) and cross-
// references it with the public open-data peak feed + the private confirmed
// stats to know which slots were actually critical, plus derive "anchor" /
// "pre-heat" windows and a `current_state` for automations. This file mirrors
// that logic using plain objects/functions instead of hydroqc's class
// hierarchy (TimeRange / BasePeak / Anchor / PreHeat), and Luxon for timezone-
// safe date math (Hydro-Québec's peak windows are always America/Toronto wall
// clock, DST included).
// -----------------------------------------------------------------------------

import { DateTime } from 'luxon';

export const HQ_ZONE = 'America/Toronto';

const CPC_MORNING_START = { hour: 6, minute: 0 };
const CPC_MORNING_END = { hour: 10, minute: 0 };
const CPC_EVENING_START = { hour: 16, minute: 0 };
const CPC_EVENING_END = { hour: 20, minute: 0 };
const CPC_MORNING_ANCHOR_START_OFFSET_H = 5;
const CPC_MORNING_ANCHOR_DURATION_H = 3;
const CPC_EVENING_ANCHOR_START_OFFSET_H = 4;
const CPC_EVENING_ANCHOR_DURATION_H = 2;
const PRE_HEAT_DURATION_MIN = 180;

function atLocalTime(day, { hour, minute }) {
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}

/** Winter bounds used to reconstruct the full CPC peak calendar. Mirrors hydroqc's
 * BasePeakHandler.winter_start_date/winter_end_date (December 1 -> March 31, local time). */
export function winterBounds(now = DateTime.now().setZone(HQ_ZONE)) {
  const year = now.month >= 12 ? now.year : now.year - 1;
  return {
    start: DateTime.fromObject({ year, month: 12, day: 1 }, { zone: HQ_ZONE }),
    end: DateTime.fromObject({ year: year + 1, month: 3, day: 31 }, { zone: HQ_ZONE }),
  };
}

function isMorning(peak) {
  return peak.startDate.hour < 12;
}

function anchorOf(peak) {
  const morning = isMorning(peak);
  const offsetHours = morning ? CPC_MORNING_ANCHOR_START_OFFSET_H : CPC_EVENING_ANCHOR_START_OFFSET_H;
  const durationHours = morning ? CPC_MORNING_ANCHOR_DURATION_H : CPC_EVENING_ANCHOR_DURATION_H;
  const start = peak.startDate.minus({ hours: offsetHours });
  return { startDate: start, endDate: start.plus({ hours: durationHours }) };
}

function preheatOf(peak) {
  return { startDate: peak.startDate.minus({ minutes: PRE_HEAT_DURATION_MIN }), endDate: peak.startDate };
}

function isBetween(now, start, end) {
  return start.toMillis() < now.toMillis() && now.toMillis() < end.toMillis();
}

function findByDay(peaks, day, wantMorning) {
  return peaks.find((p) => p.startDate.hasSame(day, 'day') && isMorning(p) === wantMorning) ?? null;
}

// --- CPC (Winter Credit) ---------------------------------------------------

/**
 * Build the full CPC peak calendar (every 06:00-10:00 and 16:00-20:00 slot of
 * the winter) and mark which ones are/were critical, using:
 *   - the public open-data feed (`openDataPeaks`, offer "CPC-D") for peaks
 *     confirmed critical but without contract-specific stats yet;
 *   - the private, authenticated CPC data (`rawCpcData`, from
 *     `HydroClient.getCpcCredit`) for confirmed critical peaks WITH the
 *     contract's actual stats (credit earned, energy curtailed...).
 */
export function buildCpcPeaks(rawCpcData, openDataPeaks, now = DateTime.now().setZone(HQ_ZONE)) {
  const winterPeriod = rawCpcData?.periodesEffacementsHivers?.[0];
  const bounds = winterPeriod
    ? {
        start: DateTime.fromISO(winterPeriod.dateDebutPeriodeHiver).setZone(HQ_ZONE),
        end: DateTime.fromISO(winterPeriod.dateFinPeriodeHiver).setZone(HQ_ZONE),
      }
    : winterBounds(now);
  const rawCriticalPeaks = winterPeriod?.periodesEffacementHiver ?? [];

  const peaks = [];
  let day = bounds.start;
  while (day.toMillis() <= bounds.end.toMillis()) {
    for (const [start, end] of [
      [CPC_MORNING_START, CPC_MORNING_END],
      [CPC_EVENING_START, CPC_EVENING_END],
    ]) {
      const peak = {
        startDate: atLocalTime(day, start),
        endDate: atLocalTime(day, end),
        isCritical: false,
        stats: null,
      };
      markCpcPeakCritical(peak, openDataPeaks, rawCriticalPeaks);
      peaks.push(peak);
    }
    day = day.plus({ days: 1 });
  }
  return { peaks, bounds, rawCriticalPeaks };
}

function markCpcPeakCritical(peak, openDataPeaks, rawCriticalPeaks) {
  for (const event of openDataPeaks) {
    if (DateTime.fromISO(event.dateFin).toMillis() === peak.endDate.toMillis()) {
      peak.isCritical = true;
      break;
    }
  }
  const defaultStartTimeStr = isMorning(peak) ? '06:00:00' : '16:00:00';
  for (const critical of rawCriticalPeaks) {
    const criticalDay = DateTime.fromISO(critical.dateEffacement);
    if (criticalDay.hasSame(peak.startDate, 'day') && critical.heureDebut === defaultStartTimeStr) {
      peak.isCritical = true;
      peak.stats = critical;
      return;
    }
  }
}

/** Cumulated / projected credit and CPC-specific derived state for one contract. */
export function summarizeCpc(rawCpcData, openDataPeaks, now = DateTime.now().setZone(HQ_ZONE)) {
  const { peaks, bounds, rawCriticalPeaks } = buildCpcPeaks(rawCpcData, openDataPeaks, now);

  const cumulatedCredit = round2(rawCriticalPeaks.reduce((sum, p) => sum + (p.montantEffacee ?? 0), 0));
  const cumulatedCurtailedEnergy = round2(rawCriticalPeaks.reduce((sum, p) => sum + (p.consoEffacee ?? 0), 0));
  const cumulatedCriticalHours = round2(
    rawCriticalPeaks.reduce((sum, p) => sum + hoursBetween(p.heureDebut, p.heureFin), 0),
  );
  const projectedRaw = rawCpcData?.montantEffaceProjete;
  const projectedCumulatedCredit = projectedRaw ? Number(projectedRaw) || 0 : 0;

  const currentPeak = peaks.find((p) => isBetween(now, p.startDate, p.endDate)) ?? null;
  const currentAnchor = peaks.map(anchorOf).find((a) => isBetween(now, a.startDate, a.endDate)) ?? null;
  const currentAnchorPeak = currentAnchor ? peaks.find((p) => anchorOf(p) === currentAnchor) : null;

  let currentState = 'normal';
  if (currentAnchorPeak) currentState = currentAnchorPeak.isCritical ? 'critical_anchor' : 'anchor';
  else if (currentPeak) currentState = currentPeak.isCritical ? 'critical_peak' : 'peak';

  const upcoming = peaks.filter((p) => now.toMillis() < p.endDate.toMillis());
  const nextPeak = upcoming.length > 0 ? upcoming.reduce((a, b) => (a.startDate < b.startDate ? a : b)) : null;
  const nextCriticalPeak =
    upcoming.filter((p) => p.isCritical).reduce((a, b) => (!a || a.startDate < b.startDate ? (a ?? b) : a), null) ??
    null;

  const yesterday = now.minus({ days: 1 });
  const tomorrow = now.plus({ days: 1 });

  return {
    winterStartDate: bounds.start,
    winterEndDate: bounds.end,
    cumulatedCredit,
    projectedCumulatedCredit,
    cumulatedCriticalHours,
    cumulatedCurtailedEnergy,
    currentState,
    currentPeakIsCritical: currentPeak?.isCritical ?? null,
    nextPeak,
    nextCriticalPeak,
    isAnyCriticalPeakComing: Boolean(nextCriticalPeak),
    preheatInProgress: nextPeak ? isBetween(now, preheatOf(nextPeak).startDate, preheatOf(nextPeak).endDate) : false,
    todayMorningPeak: findByDay(peaks, now, true),
    todayEveningPeak: findByDay(peaks, now, false),
    tomorrowMorningPeak: findByDay(peaks, tomorrow, true),
    tomorrowEveningPeak: findByDay(peaks, tomorrow, false),
    yesterdayMorningPeak: findByDay(peaks, yesterday, true),
    yesterdayEveningPeak: findByDay(peaks, yesterday, false),
  };
}

function hoursBetween(hhmmssStart, hhmmssEnd) {
  const toSeconds = (s) => {
    const [h, m, sec] = s.split(':').map(Number);
    return h * 3600 + m * 60 + sec;
  };
  return (toSeconds(hhmmssEnd) - toSeconds(hhmmssStart)) / 3600;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// --- DPC (Flex D) ------------------------------------------------------------

/**
 * Build the DPC peak list straight from the public open-data feed (offer
 * "TPC-DPC"): unlike CPC, Flex D peaks only exist when Hydro-Québec calls
 * one, so every entry in the feed IS a critical peak (hydroqc: "all peaks are
 * critical, since peaks exist only when it's needed").
 */
export function buildDpcPeaks(openDataPeaks) {
  return openDataPeaks
    .map((event) => ({
      startDate: DateTime.fromISO(event.dateDebut).setZone(HQ_ZONE),
      endDate: DateTime.fromISO(event.dateFin).setZone(HQ_ZONE),
      isCritical: true,
    }))
    .sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis());
}

export function summarizeDpc(openDataPeaks, now = DateTime.now().setZone(HQ_ZONE)) {
  const peaks = buildDpcPeaks(openDataPeaks);
  const currentPeak = peaks.find((p) => isBetween(now, p.startDate, p.endDate)) ?? null;
  const upcoming = peaks.filter((p) => now.toMillis() < p.endDate.toMillis());
  const nextPeak = upcoming.length > 0 ? upcoming.reduce((a, b) => (a.startDate < b.startDate ? a : b)) : null;

  const yesterday = now.minus({ days: 1 });
  const tomorrow = now.plus({ days: 1 });

  return {
    currentState: currentPeak ? 'peak' : 'normal',
    peakInProgress: Boolean(currentPeak),
    nextPeak,
    preheatInProgress: nextPeak ? isBetween(now, preheatOf(nextPeak).startDate, preheatOf(nextPeak).endDate) : false,
    todayMorningPeak: findByDay(peaks, now, true),
    todayEveningPeak: findByDay(peaks, now, false),
    tomorrowMorningPeak: findByDay(peaks, tomorrow, true),
    tomorrowEveningPeak: findByDay(peaks, tomorrow, false),
    yesterdayMorningPeak: findByDay(peaks, yesterday, true),
    yesterdayEveningPeak: findByDay(peaks, yesterday, false),
  };
}
