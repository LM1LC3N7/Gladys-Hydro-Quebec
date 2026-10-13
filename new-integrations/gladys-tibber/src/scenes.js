// -----------------------------------------------------------------------------
// The outputs of the scene actions. Pure.
// -----------------------------------------------------------------------------

import { cheapestWindow, localClock, localDate, slotsOfDay } from './tibber/model.js';

export const PERIODS = ['next_24h', 'today', 'tomorrow'];

const time = (iso, timeZone) => {
  if (!iso) {
    return null;
  }
  const { hour, minute } = localClock(Date.parse(iso), timeZone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/** The outputs of "price now". */
export function priceOutputs(price, { timeZone, cheapHours }) {
  if (!price) {
    return { available: false };
  }
  const window = cheapestWindow(
    price.slot
      ? [price.slot, ...(price.allSlots ?? []).filter((s) => s.startsAt > price.slot.startsAt)]
      : [],
    cheapHours,
  );
  return {
    available: true,
    price: price.slot.price,
    currency: price.slot.currency,
    level: price.slot.level,
    cheap: price.cheap,
    ends_at: price.slot.endsAt,
    ends_time: time(price.slot.endsAt, timeZone),
    next_price: price.next?.price ?? null,
    avg_price: price.stats?.avg ?? null,
    min_price: price.stats?.min ?? null,
    max_price: price.stats?.max ?? null,
    tomorrow_published: Boolean(price.tomorrow),
    tomorrow_avg_price: price.tomorrow?.stats.avg ?? null,
    window_start_time: time(window?.start, timeZone),
    window_end_time: time(window?.end, timeZone),
  };
}

/** The outputs of "cheapest hours": the window of `hours` in `period`. */
export function cheapestWindowOutputs(slots, { period, hours, now, timeZone }) {
  const nowIso = new Date(now).toISOString();
  let candidates;
  if (period === 'today') {
    candidates = slotsOfDay(slots, localDate(now, timeZone), timeZone).filter(
      (s) => s.endsAt > nowIso,
    );
  } else if (period === 'tomorrow') {
    candidates = slotsOfDay(slots, localDate(now + 24 * 60 * 60_000, timeZone), timeZone);
  } else {
    const limit = new Date(now + 24 * 60 * 60_000).toISOString();
    candidates = slots.filter((s) => s.endsAt > nowIso && s.startsAt < limit);
  }
  const window = cheapestWindow(candidates, hours);
  if (!window) {
    return { found: false, period, hours };
  }
  const all = candidates.reduce((a, s) => a + s.price, 0) / candidates.length;
  return {
    found: true,
    period,
    hours,
    start: window.start,
    end: window.end,
    start_time: time(window.start, timeZone),
    end_time: time(window.end, timeZone),
    minutes_until_start: Math.max(0, Math.round((Date.parse(window.start) - now) / 60_000)),
    avg_price: window.avg,
    saving_percent: all > 0 ? Math.round(((all - window.avg) / all) * 100) : 0,
    currency: candidates[0]?.currency ?? null,
  };
}
