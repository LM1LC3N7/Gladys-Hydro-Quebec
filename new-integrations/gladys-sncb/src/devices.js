// -----------------------------------------------------------------------------
// The Gladys devices and their states. Pure.
//
// External ids (forever):
//   station:<irailId>   a watched station (BE.NMBS.0088...)
//   network             the SNCB network (disturbances)
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { departureLine } from './model.js';

export const DEVICE_TYPES = { STATION: 'station', NETWORK: 'network' };

export const FEATURE = {
  NEXT_MINUTES: 'next_minutes',
  DELAYED: 'delayed_count',
  CANCELED: 'canceled_count',
  minutes: (i) => `dep${i}_minutes`,
  delay: (i) => `dep${i}_delay`,
  text: (i) => `dep${i}_text`,
  DISTURBANCES: 'disturbances',
  PLANNED: 'planned_works',
  LATEST: 'latest',
};

export const ids = {
  station: (gladys, stationId) => gladys.externalId(`station:${stationId}`),
  network: (gladys) => gladys.externalId('network'),
  feature: (deviceId, key) => `${deviceId}:${key}`,
};

/** { kind: 'station', stationId } | { kind: 'network' } | undefined. */
export function parseExternalId(externalId) {
  const text = String(externalId ?? '');
  const station = /:station:(BE\.NMBS\.\d{9})$/.exec(text);
  if (station) {
    return { kind: DEVICE_TYPES.STATION, stationId: station[1] };
  }
  if (/:network$/.test(text)) {
    return { kind: DEVICE_TYPES.NETWORK };
  }
  return undefined;
}

const feature = (deviceId, key, name, category, type, extra = {}) => ({
  name,
  external_id: ids.feature(deviceId, key),
  category,
  type,
  min: 0,
  max: 1440,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

const minutes = (id, key, name) =>
  feature(id, key, name, C.DURATION, T.DURATION.INTEGER, { unit: U.MINUTES });
const count = (id, key, name) =>
  feature(id, key, name, C.COUNTER_SENSOR, T.SENSOR.INTEGER, { max: 100 });
const text = (id, key, name) =>
  feature(id, key, name, C.TEXT, T.TEXT.TEXT, { min: 0, max: 0, keep_history: false });

/**
 * A station device. `watch` is { station, filters, name, distanceKm? }:
 * the filters and the custom name are stored as params, so the poll path
 * reads them from the device Gladys hands back (not from the config).
 */
export function buildStationDevice(gladys, watch, maxDepartures) {
  const id = ids.station(gladys, watch.station.id);
  const features = [
    minutes(id, FEATURE.NEXT_MINUTES, 'Next departure (min)'),
    count(id, FEATURE.DELAYED, 'Delayed trains'),
    count(id, FEATURE.CANCELED, 'Canceled trains'),
  ];
  for (let i = 1; i <= maxDepartures; i += 1) {
    features.push(minutes(id, FEATURE.minutes(i), `Departure ${i} (min)`));
    features.push(minutes(id, FEATURE.delay(i), `Departure ${i} delay (min)`));
    features.push(text(id, FEATURE.text(i), `Departure ${i}`));
  }
  const suffix = watch.filters.length > 0 ? ` → ${watch.filters.join(' | ')}` : '';
  return {
    name: watch.name ?? `SNCB ${watch.station.name}${suffix}`,
    external_id: id,
    features,
    params: [
      { name: 'station_id', value: watch.station.id },
      { name: 'station_name', value: watch.station.name },
      { name: 'filters', value: watch.filters.join('|') },
      { name: 'max_departures', value: String(maxDepartures) },
      ...(watch.distanceKm !== undefined
        ? [{ name: 'distance_km', value: watch.distanceKm.toFixed(1) }]
        : []),
    ],
  };
}

export function buildNetworkDevice(gladys) {
  const id = ids.network(gladys);
  return {
    name: 'SNCB network',
    external_id: id,
    features: [
      count(id, FEATURE.DISTURBANCES, 'Disturbances'),
      count(id, FEATURE.PLANNED, 'Planned works'),
      text(id, FEATURE.LATEST, 'Latest disturbance'),
    ],
  };
}

/** The watch settings stored in a device's params. */
export function watchOfDevice(device) {
  const params = Object.fromEntries((device.params ?? []).map((p) => [p.name, p.value]));
  return {
    stationId: params.station_id ?? parseExternalId(device.external_id)?.stationId,
    stationName: params.station_name ?? device.name,
    filters: String(params.filters ?? '')
      .split('|')
      .map((f) => f.trim())
      .filter(Boolean),
    maxDepartures: Math.max(1, Math.min(5, Number(params.max_departures) || 3)),
  };
}

const state = (deviceId, key, value) =>
  value === null || value === undefined
    ? []
    : [
        typeof value === 'string'
          ? { device_feature_external_id: ids.feature(deviceId, key), text: value }
          : { device_feature_external_id: ids.feature(deviceId, key), state: value },
      ];

export function stationStates(deviceId, reading, maxDepartures, language) {
  const states = [];
  const next = reading.departures.find((d) => !d.canceled);
  states.push(...state(deviceId, FEATURE.NEXT_MINUTES, next ? next.minutes : null));
  states.push(...state(deviceId, FEATURE.DELAYED, reading.delayed));
  states.push(...state(deviceId, FEATURE.CANCELED, reading.canceled));
  for (let i = 1; i <= maxDepartures; i += 1) {
    const d = reading.departures[i - 1];
    states.push(...state(deviceId, FEATURE.minutes(i), d && !d.canceled ? d.minutes : null));
    states.push(...state(deviceId, FEATURE.delay(i), d && !d.canceled ? d.delayMinutes : null));
    states.push(...state(deviceId, FEATURE.text(i), d ? departureLine(d, language) : '—'));
  }
  return states;
}

export function networkStates(deviceId, reading) {
  const latest = reading.items.find((d) => d.type === 'disturbance') ?? reading.items[0];
  return [
    ...state(deviceId, FEATURE.DISTURBANCES, reading.disturbances),
    ...state(deviceId, FEATURE.PLANNED, reading.planned),
    ...state(deviceId, FEATURE.LATEST, latest ? latest.title.slice(0, 200) : '—'),
  ];
}
