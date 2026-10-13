// -----------------------------------------------------------------------------
// The Gladys device of a Tibber home and its states. Pure.
//
// External id (forever): home:<tibber home id>
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';

export const FEATURE = {
  PRICE: 'price',
  LEVEL: 'price_level',
  NEXT: 'next_price',
  AVG: 'avg_price',
  MIN: 'min_price',
  MAX: 'max_price',
  CHEAP: 'cheap_period',
  CONSUMPTION: 'consumption',
  YESTERDAY_KWH: 'yesterday_consumption',
  YESTERDAY_COST: 'yesterday_cost',
  // live
  POWER: 'power',
  PRODUCTION: 'power_production',
  TODAY_KWH: 'today_consumption',
  TODAY_COST: 'today_cost',
  VOLTAGE_1: 'voltage_l1',
  VOLTAGE_2: 'voltage_l2',
  VOLTAGE_3: 'voltage_l3',
  CURRENT_1: 'current_l1',
  CURRENT_2: 'current_l2',
  CURRENT_3: 'current_l3',
  METER_INDEX: 'meter_index',
};

export const ids = {
  home: (gladys, homeId) => gladys.externalId(`home:${homeId}`),
  feature: (deviceId, key) => `${deviceId}:${key}`,
};

export function parseExternalId(externalId) {
  const match = /:home:([^:]+)$/.exec(String(externalId ?? ''));
  return match ? { homeId: match[1] } : undefined;
}

const CURRENCY_UNITS = { EUR: U.EURO, USD: U.DOLLAR, GBP: U.POUND_STERLING };

const feature = (deviceId, key, name, category, type, extra = {}) => ({
  name,
  external_id: ids.feature(deviceId, key),
  category,
  type,
  min: 0,
  max: 1,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

/** The device of a home. `home` = { id, name, currency, live }. */
export function buildHomeDevice(gladys, home) {
  const id = ids.home(gladys, home.id);
  const money = (key, name) =>
    feature(id, key, name, C.CURRENCY, T.CURRENCY.DECIMAL, {
      min: -10,
      max: 100000,
      ...(CURRENCY_UNITS[home.currency] ? { unit: CURRENCY_UNITS[home.currency] } : {}),
    });
  const features = [
    money(FEATURE.PRICE, 'Price per kWh'),
    feature(id, FEATURE.LEVEL, 'Price level', C.TEXT, T.TEXT.TEXT, {
      min: 0,
      max: 0,
      keep_history: false,
    }),
    money(FEATURE.NEXT, 'Next price per kWh'),
    money(FEATURE.AVG, "Today's average price"),
    money(FEATURE.MIN, "Today's minimum price"),
    money(FEATURE.MAX, "Today's maximum price"),
    feature(id, FEATURE.CHEAP, 'Cheap period', C.UNKNOWN, T.SENSOR.BINARY, { keep_history: false }),
    feature(
      id,
      FEATURE.CONSUMPTION,
      'Consumption (30 min)',
      C.ENERGY_SENSOR,
      T.ENERGY_SENSOR.THIRTY_MINUTES_CONSUMPTION,
      {
        unit: U.KILOWATT_HOUR,
        max: 1000,
      },
    ),
    feature(
      id,
      FEATURE.YESTERDAY_KWH,
      "Yesterday's consumption",
      C.ENERGY_SENSOR,
      T.ENERGY_SENSOR.DAILY_CONSUMPTION,
      {
        unit: U.KILOWATT_HOUR,
        max: 10000,
      },
    ),
    money(FEATURE.YESTERDAY_COST, "Yesterday's cost"),
  ];
  if (home.live) {
    features.push(
      feature(id, FEATURE.POWER, 'Power', C.ENERGY_SENSOR, T.ENERGY_SENSOR.POWER, {
        unit: U.WATT,
        max: 100000,
      }),
      feature(
        id,
        FEATURE.PRODUCTION,
        'Power production',
        C.ENERGY_PRODUCTION_SENSOR,
        T.ENERGY_PRODUCTION_SENSOR.POWER,
        { unit: U.WATT, max: 100000 },
      ),
      feature(
        id,
        FEATURE.TODAY_KWH,
        "Today's consumption",
        C.ENERGY_SENSOR,
        T.ENERGY_SENSOR.DAILY_CONSUMPTION,
        { unit: U.KILOWATT_HOUR, max: 10000 },
      ),
      money(FEATURE.TODAY_COST, "Today's cost"),
      feature(id, FEATURE.VOLTAGE_1, 'Voltage L1', C.ENERGY_SENSOR, T.ENERGY_SENSOR.VOLTAGE, {
        unit: U.VOLT,
        max: 500,
      }),
      feature(id, FEATURE.VOLTAGE_2, 'Voltage L2', C.ENERGY_SENSOR, T.ENERGY_SENSOR.VOLTAGE, {
        unit: U.VOLT,
        max: 500,
      }),
      feature(id, FEATURE.VOLTAGE_3, 'Voltage L3', C.ENERGY_SENSOR, T.ENERGY_SENSOR.VOLTAGE, {
        unit: U.VOLT,
        max: 500,
      }),
      feature(id, FEATURE.CURRENT_1, 'Current L1', C.ENERGY_SENSOR, T.ENERGY_SENSOR.CURRENT, {
        unit: U.AMPERE,
        max: 500,
      }),
      feature(id, FEATURE.CURRENT_2, 'Current L2', C.ENERGY_SENSOR, T.ENERGY_SENSOR.CURRENT, {
        unit: U.AMPERE,
        max: 500,
      }),
      feature(id, FEATURE.CURRENT_3, 'Current L3', C.ENERGY_SENSOR, T.ENERGY_SENSOR.CURRENT, {
        unit: U.AMPERE,
        max: 500,
      }),
    );
  }
  return {
    name: `Tibber ${home.name}`,
    external_id: id,
    features,
    params: [
      { name: 'home_id', value: home.id },
      { name: 'currency', value: home.currency ?? '' },
      { name: 'time_zone', value: home.timeZone ?? '' },
      { name: 'live', value: home.live ? 'true' : 'false' },
    ],
  };
}

const state = (deviceId, key, value) =>
  value === null || value === undefined
    ? []
    : [
        typeof value === 'string'
          ? { device_feature_external_id: ids.feature(deviceId, key), text: value }
          : {
              device_feature_external_id: ids.feature(deviceId, key),
              state: Math.round(value * 100000) / 100000,
            },
      ];

/** The states of a price state (src/tibber/model.js `priceState`). */
export function priceStates(deviceId, price) {
  if (!price) {
    return [];
  }
  return [
    ...state(deviceId, FEATURE.PRICE, price.slot.price),
    ...state(deviceId, FEATURE.LEVEL, price.slot.level),
    ...state(deviceId, FEATURE.NEXT, price.next?.price ?? null),
    ...state(deviceId, FEATURE.AVG, price.stats?.avg ?? null),
    ...state(deviceId, FEATURE.MIN, price.stats?.min ?? null),
    ...state(deviceId, FEATURE.MAX, price.stats?.max ?? null),
    ...state(deviceId, FEATURE.CHEAP, price.cheap ? 1 : 0),
  ];
}

export function dailyStates(deviceId, totals) {
  return [
    ...state(deviceId, FEATURE.YESTERDAY_KWH, totals.yesterdayKwh),
    ...state(deviceId, FEATURE.YESTERDAY_COST, totals.yesterdayCost),
  ];
}

export function liveStates(deviceId, live) {
  return [
    ...state(deviceId, FEATURE.POWER, live.power),
    ...state(deviceId, FEATURE.PRODUCTION, live.powerProduction),
    ...state(deviceId, FEATURE.TODAY_KWH, live.accumulatedConsumption),
    ...state(deviceId, FEATURE.TODAY_COST, live.accumulatedCost),
    ...state(deviceId, FEATURE.VOLTAGE_1, live.voltage[0]),
    ...state(deviceId, FEATURE.VOLTAGE_2, live.voltage[1]),
    ...state(deviceId, FEATURE.VOLTAGE_3, live.voltage[2]),
    ...state(deviceId, FEATURE.CURRENT_1, live.current[0]),
    ...state(deviceId, FEATURE.CURRENT_2, live.current[1]),
    ...state(deviceId, FEATURE.CURRENT_3, live.current[2]),
  ];
}
