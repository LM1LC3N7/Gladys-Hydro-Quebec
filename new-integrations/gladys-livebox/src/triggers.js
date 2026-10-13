// -----------------------------------------------------------------------------
// Transitions -> scene events. Pure. Nothing fires without a previous value.
// -----------------------------------------------------------------------------

import { SCENE_TRIGGERS } from './constants.js';

/** Presence transitions of the hosts that have a Gladys device. */
export function hostEvents(deviceIdOf, previous, current) {
  const events = [];
  if (!previous) {
    return events;
  }
  for (const host of current) {
    const before = previous.get(host.mac);
    if (!before || before.active === host.active) {
      continue;
    }
    const device = deviceIdOf(host.mac);
    if (!device) {
      continue;
    }
    events.push({
      key: host.active ? SCENE_TRIGGERS.CONNECTED : SCENE_TRIGGERS.DISCONNECTED,
      data: {
        device,
        name: host.name,
        ip: host.ip,
        mac: host.mac,
        interface: host.wireless ? 'wifi' : 'ethernet',
      },
    });
  }
  return events;
}

/** Missed calls that appeared since the previous reading. */
export function callEvents(previous, current) {
  if (!previous) {
    return [];
  }
  const known = new Set(previous.map((c) => c.id));
  return current
    .filter((c) => c.type === 'missed' && !known.has(c.id))
    .map((c) => ({
      key: SCENE_TRIGGERS.MISSED_CALL,
      data: { number: c.number, name: c.name || null, started_at: c.startedAt },
    }));
}

export function internetEvents(previous, current) {
  if (!previous || !current || previous.connected === current.connected) {
    return [];
  }
  return [
    {
      key: SCENE_TRIGGERS.INTERNET,
      data: {
        state: current.connected ? 'up' : 'down',
        link_type: current.linkType,
        ip: current.ip,
        error: current.lastError,
      },
    },
  ];
}
