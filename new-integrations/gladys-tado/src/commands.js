// -----------------------------------------------------------------------------
// A Gladys command (feature + value) -> what to ask tado. Pure: resolves a
// descriptor the app executes with the API client:
//   { kind: 'overlay', setting, termination }   a manual setting
//   { kind: 'resume' }                          back to the schedule
//   { kind: 'presence', value }                 HOME, AWAY or null (auto)
// -----------------------------------------------------------------------------

import {
  AC_MODE,
  PRESENCE,
  TEMPERATURE,
  TERMINATION,
  THERMOSTAT_MODE,
  WATER_HEATER_MODE,
} from './constants.js';
import { FEATURE, acModeName } from './devices.js';
import { GENERATIONS, ZONE_TYPES } from './tado/model.js';

export class CommandError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CommandError';
  }
}

/** The termination block of a manual setting, per API generation. */
export function terminationFor(generation, { termination, timerMinutes }) {
  const minutes = Math.max(1, Number(timerMinutes) || 60);
  if (generation === GENERATIONS.X) {
    if (termination === TERMINATION.TIMER) {
      return { type: 'TIMER', durationInSeconds: minutes * 60 };
    }
    return { type: termination === TERMINATION.MANUAL ? 'MANUAL' : 'NEXT_TIME_BLOCK' };
  }
  if (termination === TERMINATION.TIMER) {
    return { typeSkillBasedApp: 'TIMER', durationInSeconds: minutes * 60 };
  }
  return {
    typeSkillBasedApp: termination === TERMINATION.MANUAL ? 'MANUAL' : 'NEXT_TIME_BLOCK',
  };
}

const clamp = (value, min, max, step) => {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new CommandError(`Not a temperature: ${value}`);
  }
  const snapped = Math.round(n / step) * step;
  return Math.min(max, Math.max(min, Math.round(snapped * 10) / 10));
};

/** The setting block of a zone, for a target temperature (or off). */
export function settingFor(zone, { power = true, temperature, acMode } = {}) {
  if (zone.generation === GENERATIONS.X) {
    return power
      ? { power: 'ON', temperature: { value: temperature } }
      : { power: 'OFF', temperature: null };
  }
  if (zone.type === ZONE_TYPES.HOT_WATER) {
    const setting = { type: 'HOT_WATER', power: power ? 'ON' : 'OFF' };
    if (power && zone.canSetTemperature && temperature !== undefined) {
      setting.temperature = { celsius: temperature };
    }
    return setting;
  }
  if (zone.type === ZONE_TYPES.AC) {
    const setting = { type: 'AIR_CONDITIONING', power: power ? 'ON' : 'OFF' };
    if (power) {
      setting.mode = acMode ?? zone.acMode ?? 'AUTO';
      if (temperature !== undefined && setting.mode !== 'FAN' && setting.mode !== 'DRY') {
        setting.temperature = { celsius: temperature };
      }
    }
    return setting;
  }
  return power
    ? { type: 'HEATING', power: 'ON', temperature: { celsius: temperature } }
    : { type: 'HEATING', power: 'OFF' };
}

/** The target to use when switching a zone on without a given temperature. */
function currentTarget(zone, fallback) {
  return zone.targetTemperature ?? zone.nextChange?.targetTemperature ?? fallback;
}

/**
 * Resolve a command on a ZONE device. `key` is the feature key, `value` the
 * command value from Gladys, `config` the normalized configuration.
 */
export function zoneCommand(zone, key, value, config, { termination } = {}) {
  const end = terminationFor(zone.generation, {
    termination: termination ?? config.termination,
    timerMinutes: config.timerMinutes,
  });
  const overlay = (setting) => ({ kind: 'overlay', setting, termination: end });
  if (zone.type === ZONE_TYPES.HOT_WATER) {
    if (key === FEATURE.POWER) {
      return overlay(
        settingFor(zone, { power: Number(value) === 1, temperature: currentTarget(zone, 55) }),
      );
    }
    if (key === FEATURE.MODE) {
      const mode = Number(value);
      if (mode === WATER_HEATER_MODE.AUTO) {
        return { kind: 'resume' };
      }
      return overlay(
        settingFor(zone, {
          power: mode !== WATER_HEATER_MODE.OFF,
          temperature: currentTarget(zone, 55),
        }),
      );
    }
    if (key === FEATURE.TARGET) {
      const t = clamp(value, TEMPERATURE.HOT_WATER_MIN, TEMPERATURE.HOT_WATER_MAX, 1);
      return overlay(settingFor(zone, { power: true, temperature: t }));
    }
  } else if (zone.type === ZONE_TYPES.AC) {
    if (key === FEATURE.POWER) {
      return overlay(
        settingFor(zone, { power: Number(value) === 1, temperature: currentTarget(zone, 22) }),
      );
    }
    if (key === FEATURE.MODE) {
      const mode = acModeName(value);
      if (Number(value) === AC_MODE.AUTO && !zone.overlay) {
        return { kind: 'resume' };
      }
      return overlay(
        settingFor(zone, { power: true, temperature: currentTarget(zone, 22), acMode: mode }),
      );
    }
    if (key === FEATURE.TARGET) {
      return overlay(
        settingFor(zone, { power: true, temperature: clamp(value, TEMPERATURE.MIN, 30, 1) }),
      );
    }
  } else {
    if (key === FEATURE.TARGET) {
      const t = clamp(value, TEMPERATURE.MIN, TEMPERATURE.MAX, TEMPERATURE.STEP);
      return overlay(settingFor(zone, { power: true, temperature: t }));
    }
    if (key === FEATURE.MODE) {
      const mode = Number(value);
      if (mode === THERMOSTAT_MODE.AUTO) {
        return { kind: 'resume' };
      }
      if (mode === THERMOSTAT_MODE.OFF) {
        return overlay(settingFor(zone, { power: false }));
      }
      return overlay(settingFor(zone, { power: true, temperature: currentTarget(zone, 20) }));
    }
  }
  throw new CommandError(`Feature ${key} of a ${zone.type} zone is not a command`);
}

/** Resolve a command on the HOME device. */
export function homeCommand(key, value) {
  if (key === FEATURE.PRESENCE_MODE) {
    const mode = String(value).toLowerCase();
    if (mode === PRESENCE.AUTO) {
      return { kind: 'presence', value: null };
    }
    if (mode === PRESENCE.HOME || mode === PRESENCE.AWAY) {
      return { kind: 'presence', value: mode.toUpperCase() };
    }
    throw new CommandError(`Unknown presence mode ${value}`);
  }
  throw new CommandError(`Feature ${key} of the home is not a command`);
}
