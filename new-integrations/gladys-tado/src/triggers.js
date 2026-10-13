// -----------------------------------------------------------------------------
// Transitions between two readings -> scene events. Pure.
// One event per transition, never one per reading.
// -----------------------------------------------------------------------------

import { SCENE_TRIGGERS } from './constants.js';
import { isActive } from './tado/model.js';

/**
 * The events of a home between `previous` and `current` readings
 * ({ presence, zones: Map }). The first reading (previous undefined) fires
 * nothing: Gladys starts from the current state, not from a change.
 */
export function homeEvents({ gladys, homeDeviceId, zoneDeviceId }, previous, current) {
  const events = [];
  if (!previous) {
    return events;
  }
  if (
    current.presence?.presence &&
    previous.presence?.presence &&
    current.presence.presence !== previous.presence.presence
  ) {
    events.push({
      key: SCENE_TRIGGERS.PRESENCE_CHANGED,
      data: {
        device: homeDeviceId,
        presence: current.presence.presence,
        previous: previous.presence.presence,
        locked: current.presence.locked,
      },
    });
  }
  for (const [zoneId, zone] of current.zones) {
    const before = previous.zones.get(zoneId);
    if (!before) {
      continue;
    }
    const device = zoneDeviceId(zoneId);
    if (zone.openWindow && !before.openWindow) {
      events.push({
        key: SCENE_TRIGGERS.OPEN_WINDOW,
        data: { device, zone: zone.name, temperature: zone.temperature },
      });
    }
    if (zone.lowBattery && !before.lowBattery) {
      events.push({ key: SCENE_TRIGGERS.LOW_BATTERY, data: { device, zone: zone.name } });
    }
    const active = isActive(zone);
    if (active !== isActive(before)) {
      events.push({
        key: SCENE_TRIGGERS.HEATING_CHANGED,
        data: {
          device,
          zone: zone.name,
          heating: active ? 'on' : 'off',
          target_temperature: zone.targetTemperature,
          temperature: zone.temperature,
        },
      });
    }
  }
  void gladys;
  return events;
}
