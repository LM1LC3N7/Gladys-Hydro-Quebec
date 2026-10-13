// -----------------------------------------------------------------------------
// Two consecutive readings -> scene events. Pure. Nothing fires on the first
// reading (no transition without a previous value).
// -----------------------------------------------------------------------------

import {
  DELAY_THRESHOLDS,
  DEPARTURE_THRESHOLDS,
  DISRUPTION_EVENTS,
  SCENE_TRIGGERS,
} from './constants.js';

const byId = (reading) => new Map((reading?.departures ?? []).map((d) => [d.id, d]));

/** The events of a station between two readings. */
export function stationEvents(deviceId, previous, current) {
  const events = [];
  if (!previous) {
    return events;
  }
  const before = byId(previous);
  for (const d of current.departures) {
    const old = before.get(d.id);
    if (!old) {
      continue; // a train that just entered the window: no transition
    }
    const base = {
      station: deviceId,
      train: d.train,
      destination: d.destination,
      platform: d.platform,
      delay: d.delayMinutes,
      minutes: d.minutes,
      scheduled_at: d.scheduledAt,
      expected_at: d.expectedAt,
    };
    if (!d.canceled) {
      for (const threshold of DEPARTURE_THRESHOLDS) {
        if (old.minutes > threshold && d.minutes <= threshold) {
          events.push({
            key: SCENE_TRIGGERS.APPROACHING,
            data: { ...base, threshold: String(threshold) },
          });
        }
      }
    }
    if (d.canceled && !old.canceled) {
      events.push({
        key: SCENE_TRIGGERS.DISRUPTED,
        data: { ...base, event: DISRUPTION_EVENTS.CANCELED, min_delay: null },
      });
    }
    for (const min of DELAY_THRESHOLDS) {
      if (!d.canceled && old.delayMinutes < min && d.delayMinutes >= min) {
        events.push({
          key: SCENE_TRIGGERS.DISRUPTED,
          data: { ...base, event: DISRUPTION_EVENTS.DELAYED, min_delay: String(min) },
        });
      }
    }
    if (d.platformChanged && !old.platformChanged) {
      events.push({
        key: SCENE_TRIGGERS.DISRUPTED,
        data: { ...base, event: DISRUPTION_EVENTS.PLATFORM, min_delay: null },
      });
    }
  }
  return events;
}

/** The disturbances that appeared since the previous reading. */
export function networkEvents(previous, current) {
  if (!previous) {
    return [];
  }
  const known = new Set(previous.items.map((d) => d.id));
  return current.items
    .filter((d) => !known.has(d.id))
    .map((d) => ({
      key: SCENE_TRIGGERS.DISTURBANCE,
      data: {
        type: d.type,
        title: d.title.slice(0, 200),
        description: d.description.slice(0, 1000),
        link: d.link,
        published_at: d.publishedAt,
      },
    }));
}
