// -----------------------------------------------------------------------------
// Turns successive peak-state readings of a contract into scene events.
//
// A device feature carries a STATE (pre-heat in progress: yes/no); a scene
// event says "this just HAPPENED, with these details" (a critical peak was
// announced for tomorrow 6:00-10:00). Gladys scenes cannot trigger on our
// text/select features, and nothing in Gladys knows when Hydro-Québec
// announces a peak, so these transitions are published as the scene triggers
// declared in the manifest (`scene_triggers`, keys are forever: never rename).
//
// Like the core's own price-change trigger, the first reading of a contract
// after a (re)start only records the state: a restart must never re-announce
// peaks or replay a transition.
// -----------------------------------------------------------------------------

export const SCENE_TRIGGER = {
  PEAK_ANNOUNCED: 'critical_peak_announced',
  PREHEAT_STARTED: 'preheat_started',
  PEAK_STARTED: 'critical_peak_started',
  PEAK_ENDED: 'critical_peak_ended',
};

export const RATE = { WINTER_CREDIT: 'winter_credit', FLEX_D: 'flex_d' };

/**
 * Normalize the `cpc` or `dpc` part of a bridge answer: the peak schedule
 * (critical peaks not over yet, soonest first) and the two transitions.
 */
export function normalizePeakState(rate, raw) {
  return {
    rate,
    peaks: Array.isArray(raw.critical_peaks) ? raw.critical_peaks : [],
    preheat: Boolean(raw.preheat_in_progress),
    inProgress: Boolean(rate === RATE.FLEX_D ? raw.peak_in_progress : raw.critical_peak_in_progress),
  };
}

/**
 * The flat data of a scene event about one peak. The ISO timestamps from the
 * bridge carry the Eastern offset, so their date and time parts already read
 * as Hydro-Québec's local clock ("2026-12-15T16:00:00-05:00").
 */
export function peakEventData(contract, deviceExternalId, rate, peak) {
  return {
    contract: deviceExternalId,
    contract_id: contract.contractId,
    rate,
    period: peak?.period ?? null,
    day: peak?.start?.slice(0, 10) ?? null,
    start_time: peak?.start?.slice(11, 16) ?? null,
    end_time: peak?.end?.slice(11, 16) ?? null,
    starts_at: peak?.start ?? null,
    ends_at: peak?.end ?? null,
  };
}

export class PeakTracker {
  constructor() {
    this.contracts = new Map(); // `${contractId}:${rate}` -> last observation
  }

  reset() {
    this.contracts.clear();
  }

  /**
   * Record a new reading and return the scene events it implies:
   * `[{ key, data }]`, empty on the first reading of a contract.
   */
  observe(contract, deviceExternalId, state) {
    const trackKey = `${contract.contractId}:${state.rate}`;
    const previous = this.contracts.get(trackKey);
    const known = new Set(previous?.known ?? []);
    const events = [];
    const event = (key, peak) => ({ key, data: peakEventData(contract, deviceExternalId, state.rate, peak) });

    if (previous) {
      for (const peak of state.peaks) {
        if (!known.has(peak.start)) events.push(event(SCENE_TRIGGER.PEAK_ANNOUNCED, peak));
      }
      if (state.preheat && !previous.preheat) events.push(event(SCENE_TRIGGER.PREHEAT_STARTED, state.peaks[0]));
      if (state.inProgress && !previous.inProgress) events.push(event(SCENE_TRIGGER.PEAK_STARTED, state.peaks[0]));
      if (!state.inProgress && previous.inProgress) events.push(event(SCENE_TRIGGER.PEAK_ENDED, previous.current));
    }

    for (const peak of state.peaks) known.add(peak.start);
    this.contracts.set(trackKey, {
      known: [...known],
      preheat: state.preheat,
      inProgress: state.inProgress,
      // The running peak, remembered to describe its end once it is gone
      // from the schedule (which only lists peaks not over yet).
      current: state.inProgress ? state.peaks[0] : null,
    });
    return events;
  }
}
