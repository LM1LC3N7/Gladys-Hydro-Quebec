// -----------------------------------------------------------------------------
// Transitions -> scene events. Pure. Nothing fires without a previous value.
// -----------------------------------------------------------------------------

import { POWER_THRESHOLDS, SCENE_TRIGGERS } from './constants.js';

const base = (device, price) => ({
  device,
  price: price.slot.price,
  currency: price.slot.currency,
  level: price.slot.level,
  ends_at: price.slot.endsAt,
});

/** The events between two price states of a home. */
export function priceEvents(device, previous, current) {
  const events = [];
  if (!previous || !current) {
    return events;
  }
  if (current.cheap !== previous.cheap) {
    events.push({
      key: current.cheap ? SCENE_TRIGGERS.CHEAP_STARTED : SCENE_TRIGGERS.CHEAP_ENDED,
      data: base(device, current),
    });
  }
  if (current.slot.level !== previous.slot.level) {
    events.push({
      key: SCENE_TRIGGERS.LEVEL_CHANGED,
      data: { ...base(device, current), previous_level: previous.slot.level },
    });
  }
  return events;
}

/** Tomorrow's prices just appeared. */
export function tomorrowEvent(device, tomorrow, cheapHours) {
  const sorted = [...tomorrow.slots].sort((a, b) => a.price - b.price);
  const slotMs = Date.parse(sorted[0].endsAt) - Date.parse(sorted[0].startsAt);
  const count = Math.max(1, Math.round((cheapHours * 60 * 60_000) / slotMs));
  const cheapest = sorted.slice(0, count).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return {
    key: SCENE_TRIGGERS.TOMORROW,
    data: {
      device,
      currency: tomorrow.slots[0].currency,
      average: tomorrow.stats.avg,
      min: tomorrow.stats.min,
      max: tomorrow.stats.max,
      cheapest_start: cheapest[0].startsAt,
      cheapest_end: cheapest.at(-1).endsAt,
    },
  };
}

/** The power marks crossed between two live readings (both directions). */
export function powerEvents(device, previousPower, power) {
  const events = [];
  if (
    previousPower === null ||
    previousPower === undefined ||
    power === null ||
    power === undefined
  ) {
    return events;
  }
  for (const threshold of POWER_THRESHOLDS) {
    if (previousPower < threshold && power >= threshold) {
      events.push({
        key: SCENE_TRIGGERS.POWER,
        data: { device, threshold: String(threshold), direction: 'above', power },
      });
    } else if (previousPower >= threshold && power < threshold) {
      events.push({
        key: SCENE_TRIGGERS.POWER,
        data: { device, threshold: String(threshold), direction: 'below', power },
      });
    }
  }
  return events;
}
