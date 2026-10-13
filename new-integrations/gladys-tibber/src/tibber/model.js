// -----------------------------------------------------------------------------
// Tibber JSON -> plain values. Pure: no I/O, no Gladys.
//
// Prices: Tibber gives one Price per slot (hourly, or 15 minutes where the
// market moved to it), with `total` per kWh including VAT and a `level`
// against the trailing 3-day average. The slots of today and tomorrow are
// kept as one sorted list; "the slot at an instant" is the one whose
// [startsAt, endsAt) contains it.
// -----------------------------------------------------------------------------

import { LEVELS } from '../constants.js';

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** One Price node -> a slot (endsAt is filled by `slotsOf`). */
function slotOf(price) {
  return {
    startsAt: new Date(price.startsAt).toISOString(),
    price: num(price.total),
    energy: num(price.energy),
    tax: num(price.tax),
    level: LEVELS.includes(price.level) ? price.level : 'NORMAL',
    currency: price.currency ?? null,
  };
}

/** Sorted, deduplicated slots with their end, from Price nodes. */
export function slotsOf(prices = []) {
  const byStart = new Map();
  for (const p of prices) {
    if (p?.startsAt && num(p.total) !== null) {
      const slot = slotOf(p);
      byStart.set(slot.startsAt, slot);
    }
  }
  const slots = [...byStart.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  for (let i = 0; i < slots.length; i += 1) {
    const next = slots[i + 1];
    const length = next
      ? Date.parse(next.startsAt) - Date.parse(slots[i].startsAt)
      : i > 0
        ? Date.parse(slots[i].startsAt) - Date.parse(slots[i - 1].startsAt)
        : 60 * 60_000;
    slots[i].endsAt = new Date(
      Date.parse(slots[i].startsAt) + Math.max(15 * 60_000, Math.min(length, 60 * 60_000)),
    ).toISOString();
  }
  return slots;
}

/** The local calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(t, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t));
}

/** The local wall clock { hour, minute } of an instant. */
export function localClock(t, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date(t))
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return { hour: Number(parts.hour), minute: Number(parts.minute) };
}

/** The slot containing `t`, or undefined. */
export function slotAt(slots, t) {
  const iso = new Date(t).toISOString();
  return slots.find((s) => s.startsAt <= iso && iso < s.endsAt);
}

export function stats(slots) {
  if (slots.length === 0) {
    return null;
  }
  const prices = slots.map((s) => s.price);
  return {
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

/** The slots of a local day, from the whole list. */
export function slotsOfDay(slots, date, timeZone) {
  return slots.filter((s) => localDate(s.startsAt, timeZone) === date);
}

/**
 * The cheapest `hours` hours of a day: the N cheapest slots where N = hours ×
 * slots per hour. Returns the set of their `startsAt`.
 */
export function cheapSlots(daySlots, hours) {
  if (daySlots.length === 0) {
    return new Set();
  }
  const perHour = Math.max(
    1,
    Math.round((60 * 60_000) / (Date.parse(daySlots[0].endsAt) - Date.parse(daySlots[0].startsAt))),
  );
  const count = Math.min(daySlots.length, Math.max(1, Math.round(hours * perHour)));
  return new Set(
    [...daySlots]
      .sort((a, b) => a.price - b.price || a.startsAt.localeCompare(b.startsAt))
      .slice(0, count)
      .map((s) => s.startsAt),
  );
}

/**
 * The cheapest window of `hours` consecutive hours among `slots` (already
 * restricted to the period), or undefined when the period is too short.
 */
export function cheapestWindow(slots, hours) {
  if (slots.length === 0) {
    return undefined;
  }
  const slotMs = Date.parse(slots[0].endsAt) - Date.parse(slots[0].startsAt);
  const size = Math.max(1, Math.round((hours * 60 * 60_000) / slotMs));
  if (slots.length < size) {
    return undefined;
  }
  let best;
  for (let i = 0; i + size <= slots.length; i += 1) {
    const window = slots.slice(i, i + size);
    // Consecutive slots only.
    if (window.some((s, j) => j > 0 && s.startsAt !== window[j - 1].endsAt)) {
      continue;
    }
    const avg = window.reduce((a, s) => a + s.price, 0) / size;
    if (!best || avg < best.avg) {
      best = { start: window[0].startsAt, end: window[size - 1].endsAt, avg };
    }
  }
  return best;
}

/** The state of a home's prices at an instant. */
export function priceState(slots, t, { timeZone, cheapHours }) {
  const slot = slotAt(slots, t);
  if (!slot) {
    return undefined;
  }
  const today = localDate(t, timeZone);
  const daySlots = slotsOfDay(slots, today, timeZone);
  const cheap = cheapSlots(daySlots, cheapHours);
  const index = slots.indexOf(slot);
  const tomorrowSlots = slotsOfDay(slots, localDate(t + 24 * 60 * 60_000, timeZone), timeZone);
  return {
    slot,
    next: slots[index + 1],
    stats: stats(daySlots),
    cheap: cheap.has(slot.startsAt),
    cheapSlots: cheap,
    tomorrow:
      tomorrowSlots.length > 0 ? { slots: tomorrowSlots, stats: stats(tomorrowSlots) } : null,
  };
}

// --- Consumption ---------------------------------------------------------------

/**
 * Hourly consumption nodes -> 30-minute intervals (two equal halves), for
 * publishEnergyConsumption. Incomplete hours (null consumption) are skipped.
 */
export function halfHours(nodes = []) {
  const out = [];
  for (const node of nodes) {
    const kwh = num(node.consumption);
    if (kwh === null || !node.from) {
      continue;
    }
    const from = Date.parse(node.from);
    const to = node.to ? Date.parse(node.to) : from + 60 * 60_000;
    const halves = Math.max(1, Math.round((to - from) / (30 * 60_000)));
    for (let i = 0; i < halves; i += 1) {
      out.push({ starts_at: new Date(from + i * 30 * 60_000).toISOString(), kwh: kwh / halves });
    }
  }
  return out;
}

/** Yesterday's and today's totals from hourly nodes. */
export function dailyTotals(nodes = [], timeZone, t) {
  const today = localDate(t, timeZone);
  const yesterday = localDate(t - 24 * 60 * 60_000, timeZone);
  const sum = (date, key) =>
    nodes
      .filter((n) => n.from && localDate(n.from, timeZone) === date && num(n[key]) !== null)
      .reduce((a, n) => a + n[key], 0);
  return {
    todayKwh: sum(today, 'consumption'),
    todayCost: sum(today, 'cost'),
    yesterdayKwh: sum(yesterday, 'consumption'),
    yesterdayCost: sum(yesterday, 'cost'),
  };
}

// --- Live measurement (Pulse / Watty) --------------------------------------------

export function liveOf(measurement = {}) {
  return {
    timestamp: measurement.timestamp ?? null,
    power: num(measurement.power),
    powerProduction: num(measurement.powerProduction),
    accumulatedConsumption: num(measurement.accumulatedConsumption),
    accumulatedProduction: num(measurement.accumulatedProduction),
    accumulatedCost: num(measurement.accumulatedCost),
    currency: measurement.currency ?? null,
    minPower: num(measurement.minPower),
    averagePower: num(measurement.averagePower),
    maxPower: num(measurement.maxPower),
    voltage: [measurement.voltagePhase1, measurement.voltagePhase2, measurement.voltagePhase3].map(
      num,
    ),
    current: [measurement.currentL1, measurement.currentL2, measurement.currentL3].map(num),
    signalStrength: num(measurement.signalStrength),
    lastMeterConsumption: num(measurement.lastMeterConsumption),
  };
}
