// -----------------------------------------------------------------------------
// The Gladys devices of a tado home and the states of a reading. Pure.
//
// External ids (forever):
//   home:<homeId>            the home (presence, weather)
//   zone:<homeId>:<zoneId>   a zone or a tado X room
//   phone:<homeId>:<phoneId> a phone with geofencing (optional)
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import {
  AC_MODE,
  OPENING_SENSOR_STATE,
  PRESENCE,
  TEMPERATURE,
  THERMOSTAT_MODE,
  THERMOSTAT_OPERATING_STATE,
  WATER_HEATER_MODE,
} from './constants.js';
import { ZONE_TYPES, isActive } from './tado/model.js';

/** The feature keys (the last segment of the feature external ids). Forever. */
export const FEATURE = {
  // home
  PRESENCE: 'presence',
  PRESENCE_MODE: 'presence_mode',
  OUTSIDE_TEMPERATURE: 'outside_temperature',
  SOLAR: 'solar_intensity',
  WEATHER: 'weather',
  // zones
  TARGET: 'target_temperature',
  MODE: 'mode',
  OPERATING: 'operating_state',
  POWER: 'power',
  TEMPERATURE: 'temperature',
  HUMIDITY: 'humidity',
  HEATING_POWER: 'heating_power',
  OPEN_WINDOW: 'open_window',
  LOW_BATTERY: 'low_battery',
  // phones
  AT_HOME: 'at_home',
};

export const ids = {
  home: (gladys, homeId) => gladys.externalId(`home:${homeId}`),
  zone: (gladys, homeId, zoneId) => gladys.externalId(`zone:${homeId}:${zoneId}`),
  phone: (gladys, homeId, phoneId) => gladys.externalId(`phone:${homeId}:${phoneId}`),
  feature: (deviceId, key) => `${deviceId}:${key}`,
};

/** Parse a device external id: { kind, homeId, id } or undefined. */
export function parseExternalId(externalId) {
  const match = /:(home|zone|phone):([^:]+)(?::([^:]+))?$/.exec(String(externalId ?? ''));
  if (!match) {
    return undefined;
  }
  return { kind: match[1], homeId: match[2], id: match[3] };
}

const feature = (deviceId, key, name, category, type, extra = {}) => ({
  name,
  external_id: ids.feature(deviceId, key),
  category,
  type,
  min: 0,
  max: 1,
  read_only: true,
  has_feedback: true,
  keep_history: true,
  ...extra,
});

const option = (value, label) => ({ value, label });

export function buildHomeDevice(gladys, home) {
  const id = ids.home(gladys, home.id);
  return {
    name: `tado° ${home.name}`,
    external_id: id,
    features: [
      feature(id, FEATURE.PRESENCE, 'At home', C.PRESENCE_SENSOR, T.SENSOR.BINARY),
      feature(id, FEATURE.PRESENCE_MODE, 'Presence', C.TEXT, T.TEXT.SELECT, {
        min: 0,
        max: 0,
        read_only: false,
        keep_history: false,
        supported_options: [
          {
            ...option(PRESENCE.AUTO, {
              en: 'Automatic (geofencing)',
              fr: 'Automatique (géolocalisation)',
            }),
            sort_order: 0,
          },
          { ...option(PRESENCE.HOME, { en: 'Home', fr: 'Maison' }), sort_order: 1 },
          { ...option(PRESENCE.AWAY, { en: 'Away', fr: 'Absent' }), sort_order: 2 },
        ],
      }),
      feature(
        id,
        FEATURE.OUTSIDE_TEMPERATURE,
        'Outside temperature',
        C.TEMPERATURE_SENSOR,
        T.SENSOR.DECIMAL,
        {
          unit: U.CELSIUS,
          min: -50,
          max: 60,
        },
      ),
      feature(id, FEATURE.SOLAR, 'Solar intensity', C.UNKNOWN, T.SENSOR.DECIMAL, {
        unit: U.PERCENT,
        min: 0,
        max: 100,
      }),
      feature(id, FEATURE.WEATHER, 'Weather', C.TEXT, T.TEXT.TEXT, {
        min: 0,
        max: 0,
        keep_history: false,
      }),
    ],
  };
}

function heatingFeatures(id) {
  return [
    feature(
      id,
      FEATURE.TARGET,
      'Target temperature',
      C.THERMOSTAT,
      T.THERMOSTAT.TARGET_TEMPERATURE,
      {
        unit: U.CELSIUS,
        min: TEMPERATURE.MIN,
        max: TEMPERATURE.MAX,
        step: TEMPERATURE.STEP,
        read_only: false,
      },
    ),
    feature(id, FEATURE.MODE, 'Mode', C.THERMOSTAT, T.THERMOSTAT.MODE, {
      min: THERMOSTAT_MODE.OFF,
      max: THERMOSTAT_MODE.AUTO,
      read_only: false,
      keep_history: false,
      supported_options: [
        { ...option(THERMOSTAT_MODE.OFF, { en: 'Off', fr: 'Arrêt' }), sort_order: 0 },
        { ...option(THERMOSTAT_MODE.HEATING, { en: 'Manual', fr: 'Manuel' }), sort_order: 1 },
        { ...option(THERMOSTAT_MODE.AUTO, { en: 'Schedule', fr: 'Programmation' }), sort_order: 2 },
      ],
    }),
    feature(id, FEATURE.OPERATING, 'Heating', C.THERMOSTAT, T.THERMOSTAT.OPERATING_STATE, {
      min: THERMOSTAT_OPERATING_STATE.IDLE,
      max: THERMOSTAT_OPERATING_STATE.COOLING,
      keep_history: false,
    }),
    feature(id, FEATURE.HEATING_POWER, 'Heating power', C.UNKNOWN, T.SENSOR.DECIMAL, {
      unit: U.PERCENT,
      min: 0,
      max: 100,
    }),
  ];
}

function hotWaterFeatures(id, zone) {
  const features = [
    feature(id, FEATURE.POWER, 'Hot water', C.WATER_HEATER, T.WATER_HEATER.BINARY, {
      read_only: false,
    }),
    feature(id, FEATURE.MODE, 'Mode', C.WATER_HEATER, T.WATER_HEATER.MODE, {
      min: WATER_HEATER_MODE.OFF,
      max: WATER_HEATER_MODE.MANUAL,
      read_only: false,
      keep_history: false,
      supported_options: [
        { ...option(WATER_HEATER_MODE.OFF, { en: 'Off', fr: 'Arrêt' }), sort_order: 0 },
        { ...option(WATER_HEATER_MODE.MANUAL, { en: 'Manual', fr: 'Manuel' }), sort_order: 1 },
        {
          ...option(WATER_HEATER_MODE.AUTO, { en: 'Schedule', fr: 'Programmation' }),
          sort_order: 2,
        },
      ],
    }),
  ];
  if (zone.canSetTemperature) {
    features.push(
      feature(
        id,
        FEATURE.TARGET,
        'Target temperature',
        C.WATER_HEATER,
        T.WATER_HEATER.TARGET_TEMPERATURE,
        {
          unit: U.CELSIUS,
          min: TEMPERATURE.HOT_WATER_MIN,
          max: TEMPERATURE.HOT_WATER_MAX,
          step: 1,
          read_only: false,
        },
      ),
    );
  }
  return features;
}

function acFeatures(id) {
  return [
    feature(id, FEATURE.POWER, 'Air conditioning', C.AIR_CONDITIONING, T.AIR_CONDITIONING.BINARY, {
      read_only: false,
    }),
    feature(id, FEATURE.MODE, 'Mode', C.AIR_CONDITIONING, T.AIR_CONDITIONING.MODE, {
      min: AC_MODE.AUTO,
      max: AC_MODE.FAN,
      read_only: false,
      keep_history: false,
      supported_options: [
        { ...option(AC_MODE.AUTO, { en: 'Auto', fr: 'Auto' }), sort_order: 0 },
        { ...option(AC_MODE.COOLING, { en: 'Cool', fr: 'Froid' }), sort_order: 1 },
        { ...option(AC_MODE.HEATING, { en: 'Heat', fr: 'Chaud' }), sort_order: 2 },
        { ...option(AC_MODE.DRYING, { en: 'Dry', fr: 'Déshumidification' }), sort_order: 3 },
        { ...option(AC_MODE.FAN, { en: 'Fan', fr: 'Ventilation' }), sort_order: 4 },
      ],
    }),
    feature(
      id,
      FEATURE.TARGET,
      'Target temperature',
      C.AIR_CONDITIONING,
      T.AIR_CONDITIONING.TARGET_TEMPERATURE,
      {
        unit: U.CELSIUS,
        min: TEMPERATURE.MIN,
        max: 30,
        step: 1,
        read_only: false,
      },
    ),
  ];
}

export function buildZoneDevice(gladys, home, zone) {
  const id = ids.zone(gladys, home.id, zone.id);
  const typed =
    zone.type === ZONE_TYPES.HOT_WATER
      ? hotWaterFeatures(id, zone)
      : zone.type === ZONE_TYPES.AC
        ? acFeatures(id)
        : heatingFeatures(id);
  const sensors =
    zone.type === ZONE_TYPES.HOT_WATER
      ? []
      : [
          feature(id, FEATURE.TEMPERATURE, 'Temperature', C.TEMPERATURE_SENSOR, T.SENSOR.DECIMAL, {
            unit: U.CELSIUS,
            min: -20,
            max: 60,
          }),
          feature(id, FEATURE.HUMIDITY, 'Humidity', C.HUMIDITY_SENSOR, T.SENSOR.DECIMAL, {
            unit: U.PERCENT,
            min: 0,
            max: 100,
          }),
          feature(id, FEATURE.OPEN_WINDOW, 'Open window', C.OPENING_SENSOR, T.SENSOR.BINARY, {
            keep_history: false,
          }),
        ];
  return {
    name: `tado° ${zone.name}`,
    external_id: id,
    features: [
      ...typed,
      ...sensors,
      feature(id, FEATURE.LOW_BATTERY, 'Low battery', C.BATTERY_LOW, T.BATTERY_LOW.BINARY, {
        keep_history: false,
      }),
    ],
    params: [
      { name: 'home_id', value: String(home.id) },
      { name: 'zone_id', value: String(zone.id) },
      { name: 'zone_type', value: zone.type },
      { name: 'generation', value: zone.generation },
    ],
  };
}

export function buildPhoneDevice(gladys, home, phone) {
  const id = ids.phone(gladys, home.id, phone.id);
  return {
    name: `tado° ${phone.name}`,
    external_id: id,
    features: [feature(id, FEATURE.AT_HOME, 'At home', C.PRESENCE_SENSOR, T.SENSOR.BINARY)],
  };
}

// --- States --------------------------------------------------------------------

const state = (deviceId, key, value) =>
  value === null || value === undefined
    ? []
    : [
        typeof value === 'string'
          ? { device_feature_external_id: ids.feature(deviceId, key), text: value }
          : { device_feature_external_id: ids.feature(deviceId, key), state: value },
      ];

/** The mode of a heating zone as Gladys sees it. */
export function thermostatMode(zone) {
  if (!zone.power) {
    return THERMOSTAT_MODE.OFF;
  }
  return zone.overlay ? THERMOSTAT_MODE.HEATING : THERMOSTAT_MODE.AUTO;
}

export function waterHeaterMode(zone) {
  if (!zone.power) {
    return WATER_HEATER_MODE.OFF;
  }
  return zone.overlay ? WATER_HEATER_MODE.MANUAL : WATER_HEATER_MODE.AUTO;
}

const AC_MODES = {
  AUTO: AC_MODE.AUTO,
  COOL: AC_MODE.COOLING,
  HEAT: AC_MODE.HEATING,
  DRY: AC_MODE.DRYING,
  FAN: AC_MODE.FAN,
};

export function acModeValue(mode) {
  return mode && mode in AC_MODES ? AC_MODES[mode] : null;
}

export function acModeName(value) {
  return Object.keys(AC_MODES).find((k) => AC_MODES[k] === Number(value)) ?? 'AUTO';
}

export function zoneStates(gladys, home, zone) {
  const id = ids.zone(gladys, home.id, zone.id);
  const states = [];
  if (zone.type === ZONE_TYPES.HOT_WATER) {
    states.push(...state(id, FEATURE.POWER, zone.power ? 1 : 0));
    states.push(...state(id, FEATURE.MODE, waterHeaterMode(zone)));
    if (zone.canSetTemperature) {
      states.push(...state(id, FEATURE.TARGET, zone.targetTemperature));
    }
  } else if (zone.type === ZONE_TYPES.AC) {
    states.push(...state(id, FEATURE.POWER, zone.power ? 1 : 0));
    states.push(...state(id, FEATURE.MODE, acModeValue(zone.acMode)));
    states.push(...state(id, FEATURE.TARGET, zone.targetTemperature));
  } else {
    states.push(...state(id, FEATURE.TARGET, zone.targetTemperature));
    states.push(...state(id, FEATURE.MODE, thermostatMode(zone)));
    states.push(
      ...state(
        id,
        FEATURE.OPERATING,
        isActive(zone) ? THERMOSTAT_OPERATING_STATE.HEATING : THERMOSTAT_OPERATING_STATE.IDLE,
      ),
    );
    states.push(...state(id, FEATURE.HEATING_POWER, zone.heatingPower));
  }
  if (zone.type !== ZONE_TYPES.HOT_WATER) {
    states.push(...state(id, FEATURE.TEMPERATURE, zone.temperature));
    states.push(...state(id, FEATURE.HUMIDITY, zone.humidity));
    states.push(
      ...state(
        id,
        FEATURE.OPEN_WINDOW,
        zone.openWindow ? OPENING_SENSOR_STATE.OPEN : OPENING_SENSOR_STATE.CLOSE,
      ),
    );
  }
  states.push(...state(id, FEATURE.LOW_BATTERY, zone.lowBattery ? 1 : 0));
  return states;
}

export function homeStates(gladys, home, { presence, weather }) {
  const id = ids.home(gladys, home.id);
  const states = [];
  if (presence) {
    states.push(
      ...state(
        id,
        FEATURE.PRESENCE,
        presence.presence === null ? null : presence.presence === 'home' ? 1 : 0,
      ),
    );
    states.push(...state(id, FEATURE.PRESENCE_MODE, presence.mode));
  }
  if (weather) {
    states.push(...state(id, FEATURE.OUTSIDE_TEMPERATURE, weather.outsideTemperature));
    states.push(...state(id, FEATURE.SOLAR, weather.solarIntensity));
    states.push(...state(id, FEATURE.WEATHER, weather.state));
  }
  return states;
}

export function phoneStates(gladys, home, phone) {
  const id = ids.phone(gladys, home.id, phone.id);
  return state(id, FEATURE.AT_HOME, phone.atHome === null ? null : phone.atHome ? 1 : 0);
}
