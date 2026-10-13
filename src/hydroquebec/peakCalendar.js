// -----------------------------------------------------------------------------
// The `hq-critical-peaks` tariff calendar of Gladys (manifest
// `energy_contracts`): the 30-minute slots of the Flex D peak events, read
// from Hydro-Québec's public open-data feed. Gladys's Flex D contract template
// prices the energy of those slots at the peak price and keeps it out of the
// off-peak allowance.
//
// The feed only lists recent events, so a slot is never taken back once its
// event has started: only a FUTURE slot whose event disappeared from the feed
// (a cancelled announcement) is set back to `normal`. Gladys recomputes the
// costs from the earliest slot that changed.
// -----------------------------------------------------------------------------

export const CALENDAR_KEY = 'hq-critical-peaks';
export const PEAK = 'critical-peak';
export const NORMAL = 'normal';

const SLOT_MS = 30 * 60 * 1000;
const MAX_ENTRIES_PER_CALL = 2000;
// Gladys accepts entries from 5 years back to 7 days ahead.
const FUTURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PAST_WINDOW_MS = (5 * 365 - 1) * 24 * 60 * 60 * 1000;

/** The 30-minute slots (ISO instants, sorted) covered by the peak events. */
export function peakSlots(events) {
  const slots = new Set();
  for (const { start, end } of events ?? []) {
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    // Flex D events start and end on the hour: align defensively anyway.
    for (let at = Math.floor(startMs / SLOT_MS) * SLOT_MS; at < endMs; at += SLOT_MS) {
      slots.add(new Date(at).toISOString());
    }
  }
  return [...slots].sort();
}

export class PeakCalendarPublisher {
  /**
   * @param {object} options
   * @param {object} options.gladys the GladysIntegration
   * @param {object} options.logger
   * @param {() => Date} [options.now]
   */
  constructor({ gladys, logger, now = () => new Date() }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.published = new Map(); // slot ISO instant -> value Gladys holds
    this.loaded = false;
    this.disabled = false;
  }

  /** Read the peak events and publish the slots that changed. Returns the number of entries sent. */
  async refresh(session) {
    if (this.disabled) return 0;
    const now = this.now().getTime();
    const events = await session.fetchPeakEvents();
    const announced = new Set(
      peakSlots(events).filter((slot) => {
        const at = Date.parse(slot);
        return at >= now - PAST_WINDOW_MS && at <= now + FUTURE_WINDOW_MS;
      }),
    );

    try {
      if (!this.loaded) {
        // After a restart: the upcoming slots Gladys already holds, so that a
        // peak cancelled meanwhile is still set back to normal.
        const entries = await this.gladys.getEnergyCalendar(CALENDAR_KEY, {
          from: new Date(now),
          to: new Date(now + FUTURE_WINDOW_MS),
        });
        for (const entry of entries ?? []) this.published.set(new Date(entry.starts_at).toISOString(), entry.value);
        this.loaded = true;
      }

      const entries = [];
      for (const slot of announced) {
        if (this.published.get(slot) !== PEAK) entries.push({ starts_at: slot, value: PEAK });
      }
      for (const [slot, value] of this.published) {
        if (value === PEAK && !announced.has(slot) && Date.parse(slot) > now) {
          entries.push({ starts_at: slot, value: NORMAL });
        }
      }

      for (let i = 0; i < entries.length; i += MAX_ENTRIES_PER_CALL) {
        const batch = entries.slice(i, i + MAX_ENTRIES_PER_CALL);
        await this.gladys.publishEnergyCalendar(CALENDAR_KEY, batch);
        for (const entry of batch) this.published.set(entry.starts_at, entry.value);
      }
      return entries.length;
    } catch (err) {
      if (err.status === 403) {
        // Another integration owns the calendar (the first one installed
        // declaring it does): it feeds the contracts, nothing to do here.
        this.disabled = true;
        this.logger.warn(`The ${CALENDAR_KEY} calendar is owned by another integration: not publishing peak events`);
        return 0;
      }
      throw err;
    }
  }

  /** Forget what Gladys holds (new session): the next refresh reads it back. */
  reset() {
    this.published.clear();
    this.loaded = false;
    this.disabled = false;
  }
}
