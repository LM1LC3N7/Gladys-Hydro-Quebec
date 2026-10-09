// -----------------------------------------------------------------------------
// Peak timing: re-evaluate the peak state at the exact instants it changes.
//
// The regular refresh runs every `poll_frequency` (1 hour by default), so on
// its own a pre-heat or a critical peak could be reported up to an hour late,
// too late for a scene lowering the heating at the start of the peak. The
// peak schedule is known in advance (the bridge returns every critical peak
// not over yet, with its pre-heat start), so this module arms one timer per
// upcoming transition (pre-heat start, peak start, peak end) and asks for a
// fresh reading right after each: no Hydro-Québec request is involved, the
// bridge recomputes the state from data it already holds.
//
// It also re-reads Hydro-Québec's public feed of announced peak events every
// 15 minutes during the hours it announces the next day's peaks (late morning
// to mid-afternoon, Eastern time), with a random per-install offset so that
// installs do not all query it at the same second.
// -----------------------------------------------------------------------------

const TRANSITION_HORIZON_MS = 48 * 60 * 60 * 1000;
// Fire a little after the instant: hydroqc compares with strict inequalities
// (start < now), so a reading exactly at the boundary would still be "before".
const TRANSITION_DELAY_MS = 5_000;
const ANNOUNCEMENT_CHECK_EVERY_MS = 15 * 60 * 1000;
const ANNOUNCEMENT_MAX_JITTER_MS = 2 * 60 * 1000;
// Hydro-Québec publishes the next day's peak events around midday.
const ANNOUNCEMENT_WINDOW = { from: 10 * 60 + 30, to: 15 * 60 }; // minutes of the Eastern day

const easternClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Is `date` within the hours Hydro-Québec announces the next day's peaks (Eastern time)? */
export function isAnnouncementWindow(date) {
  const parts = Object.fromEntries(easternClock.formatToParts(date).map((p) => [p.type, p.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= ANNOUNCEMENT_WINDOW.from && minutes < ANNOUNCEMENT_WINDOW.to;
}

/** The upcoming instants (ms) a peak state changes at, within the horizon, sorted and unique. */
export function transitionInstants(peaks, now = Date.now(), horizonMs = TRANSITION_HORIZON_MS) {
  const instants = new Set();
  for (const peak of peaks ?? []) {
    for (const iso of [peak.preheat_start, peak.start, peak.end]) {
      const at = Date.parse(iso);
      if (Number.isFinite(at) && at > now && at <= now + horizonMs) instants.add(at);
    }
  }
  return [...instants].sort((a, b) => a - b);
}

export class PeakScheduler {
  /**
   * @param {object} options
   * @param {(contractId: string) => Promise<void>} options.onTransition re-read one contract's peak state
   * @param {() => Promise<void>} options.onAnnouncementCheck re-read the announced peaks of every contract
   * @param {object} options.logger
   */
  constructor({ onTransition, onAnnouncementCheck, logger, random = Math.random }) {
    this.onTransition = onTransition;
    this.onAnnouncementCheck = onAnnouncementCheck;
    this.logger = logger;
    this.random = random;
    this.timers = new Map(); // contractId -> timeout handles
    this.announcementTimer = null;
  }

  /** (Re)arm the transition timers of one contract from its current peak schedule. */
  schedule(contractId, peaks, now = Date.now()) {
    this.clear(contractId);
    const handles = transitionInstants(peaks, now).map((at) => {
      const handle = setTimeout(
        () => {
          this.onTransition(contractId).catch((err) => {
            this.logger.error(`Peak transition refresh failed for contract ${contractId}`, err);
          });
        },
        at - now + TRANSITION_DELAY_MS,
      );
      handle.unref?.();
      return handle;
    });
    if (handles.length > 0) this.timers.set(contractId, handles);
    return handles.length;
  }

  clear(contractId) {
    for (const handle of this.timers.get(contractId) ?? []) clearTimeout(handle);
    this.timers.delete(contractId);
  }

  /** Check the announced peaks every 15 minutes, only acting inside the announcement window. */
  startAnnouncementChecks() {
    if (this.announcementTimer) return;
    const tick = () => {
      if (!isAnnouncementWindow(new Date())) return;
      this.onAnnouncementCheck().catch((err) => this.logger.error('Peak announcement check failed', err));
    };
    const jitter = Math.floor(this.random() * ANNOUNCEMENT_MAX_JITTER_MS);
    this.announcementTimer = setTimeout(() => {
      tick();
      this.announcementTimer = setInterval(tick, ANNOUNCEMENT_CHECK_EVERY_MS);
      this.announcementTimer.unref?.();
    }, jitter);
    this.announcementTimer.unref?.();
  }

  stop() {
    for (const contractId of [...this.timers.keys()]) this.clear(contractId);
    if (this.announcementTimer) {
      clearTimeout(this.announcementTimer);
      clearInterval(this.announcementTimer);
      this.announcementTimer = null;
    }
  }
}
