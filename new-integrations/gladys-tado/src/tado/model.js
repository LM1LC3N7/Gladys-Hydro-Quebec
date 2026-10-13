// -----------------------------------------------------------------------------
// tado JSON -> plain values. Pure: no I/O, no Gladys.
//
// A "zone" here is the unit the user heats: a classic zone (V3+, V3, V2) or a
// tado X room. Both are normalized to the same shape so that the rest of the
// code never knows which API produced it.
// -----------------------------------------------------------------------------

export const ZONE_TYPES = { HEATING: 'HEATING', HOT_WATER: 'HOT_WATER', AC: 'AIR_CONDITIONING' };
export const GENERATIONS = { V2: 'v2', X: 'x' };

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const round1 = (value) => (value === null ? null : Math.round(value * 10) / 10);

/** 'ON' / 'OFF' (or a boolean) -> boolean. */
const isOn = (value) => value === 'ON' || value === true;

/** The termination of a manual setting, normalized. */
function overlayOf(termination, fallbackType) {
  if (!termination) {
    return null;
  }
  const raw = String(termination.typeSkillBasedApp ?? termination.type ?? fallbackType ?? 'MANUAL');
  const type = raw === 'TADO_MODE' ? 'NEXT_TIME_BLOCK' : raw;
  const expiresAt = termination.expiry ?? termination.projectedExpiry ?? null;
  return { type, expiresAt };
}

/** A classic zone (from /zones) + its state (from /zoneStates). */
export function zoneFromV2(zone, state = {}) {
  const setting = state.setting ?? {};
  const sensors = state.sensorDataPoints ?? {};
  const activity = state.activityDataPoints ?? {};
  const type = zone.type ?? setting.type ?? ZONE_TYPES.HEATING;
  const power = isOn(setting.power);
  const heatingPower =
    type === ZONE_TYPES.AC
      ? isOn(activity.acPower?.value)
        ? 100
        : 0
      : num(activity.heatingPower?.percentage);
  const next = state.nextScheduleChange;
  return {
    id: String(zone.id),
    name: zone.name ?? `Zone ${zone.id}`,
    type,
    generation: GENERATIONS.V2,
    power,
    targetTemperature: power ? num(setting.temperature?.celsius) : null,
    canSetTemperature:
      type !== ZONE_TYPES.HOT_WATER ||
      (zone.canSetTemperature ??
        (setting.temperature !== null && setting.temperature !== undefined)),
    temperature: round1(num(sensors.insideTemperature?.celsius)),
    humidity: round1(num(sensors.humidity?.percentage)),
    heatingPower,
    overlay: state.overlayType || state.overlay ? overlayOf(state.overlay?.termination) : null,
    openWindow: Boolean(state.openWindow) || state.openWindowDetected === true,
    online: state.link ? state.link.state === 'ONLINE' : true,
    acMode: type === ZONE_TYPES.AC ? (setting.mode ?? null) : null,
    nextChange: next
      ? { start: next.start ?? null, targetTemperature: num(next.setting?.temperature?.celsius) }
      : null,
    lowBattery: (zone.devices ?? []).some((d) => d.batteryState === 'LOW'),
    devices: (zone.devices ?? []).map((d) => ({
      serial: d.serialNo ?? d.shortSerialNo ?? null,
      type: d.deviceType ?? null,
      battery: d.batteryState ?? null,
      connected: d.connectionState ? d.connectionState.value !== false : true,
    })),
  };
}

/** A tado X room (from /rooms, hops), with the battery of its devices. */
export function zoneFromX(room, devices = []) {
  const setting = room.setting ?? {};
  const sensors = room.sensorDataPoints ?? {};
  const power = isOn(setting.power);
  const next = room.nextScheduleChange;
  return {
    id: String(room.id),
    name: room.name ?? `Room ${room.id}`,
    type: ZONE_TYPES.HEATING,
    generation: GENERATIONS.X,
    power,
    targetTemperature: power ? num(setting.temperature?.value) : null,
    canSetTemperature: true,
    temperature: round1(num(sensors.insideTemperature?.value)),
    humidity: round1(num(sensors.humidity?.percentage)),
    heatingPower: num(room.heatingPower?.percentage),
    overlay: room.manualControlTermination
      ? overlayOf(room.manualControlTermination, 'MANUAL')
      : null,
    openWindow: room.openWindow?.activated === true,
    online: room.connection ? room.connection.state === 'ONLINE' : true,
    acMode: null,
    nextChange: next
      ? { start: next.start ?? null, targetTemperature: num(next.temperature?.value) }
      : null,
    lowBattery: devices.some((d) => d.batteryState === 'LOW'),
    devices: devices.map((d) => ({
      serial: d.serialNumber ?? d.serialNo ?? null,
      type: d.type ?? null,
      battery: d.batteryState ?? null,
      connected: d.connection ? d.connection.state === 'ONLINE' : true,
    })),
  };
}

/** The home: presence and its lock, from /homes/{id}/state. */
export function presenceFromState(state = {}) {
  const presence = state.presence === 'AWAY' ? 'away' : state.presence === 'HOME' ? 'home' : null;
  return {
    presence,
    locked: state.presenceLocked === true,
    /** The value of the select feature: auto, home or away. */
    mode: state.presenceLocked === true && presence ? presence : 'auto',
  };
}

/** The weather of the home, from /homes/{id}/weather. */
export function weatherFromState(weather = {}) {
  return {
    outsideTemperature: round1(num(weather.outsideTemperature?.celsius)),
    solarIntensity: round1(num(weather.solarIntensity?.percentage)),
    state: weather.weatherState?.value ?? null,
  };
}

/** The phones with geofencing on, from /homes/{id}/mobileDevices. */
export function phonesFromDevices(devices = []) {
  return devices
    .filter((d) => d.settings?.geoTrackingEnabled === true)
    .map((d) => ({
      id: String(d.id),
      name: d.name ?? `Phone ${d.id}`,
      atHome: d.location ? d.location.atHome === true : null,
      stale: d.location?.stale === true,
    }));
}

/** Is the zone heating (or cooling) right now? */
export function isActive(zone) {
  return zone.power && (zone.heatingPower ?? 0) > 0;
}
