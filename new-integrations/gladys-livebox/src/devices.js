// -----------------------------------------------------------------------------
// The Gladys devices and their states. Pure.
//
// External ids (forever):
//   box               the Livebox
//   host:<mac>        a LAN device (presence)
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';

export const FEATURE = {
  INTERNET: 'internet',
  LINK_TYPE: 'link_type',
  IP: 'ip_address',
  UPTIME: 'uptime',
  WIFI: 'wifi',
  GUEST_WIFI: 'guest_wifi',
  ONLINE: 'devices_online',
  WIFI_ONLINE: 'wifi_devices_online',
  MISSED_CALLS: 'missed_calls',
  LAST_CALL: 'last_call',
  DOWN: 'download_rate',
  UP: 'upload_rate',
  PRESENCE: 'presence',
};

export const ids = {
  box: (gladys) => gladys.externalId('box'),
  host: (gladys, mac) => gladys.externalId(`host:${mac.toLowerCase().replace(/:/g, '')}`),
  feature: (deviceId, key) => `${deviceId}:${key}`,
};

export function parseExternalId(externalId) {
  const text = String(externalId ?? '');
  if (/:box$/.test(text)) {
    return { kind: 'box' };
  }
  const host = /:host:([0-9a-f]{12})$/.exec(text);
  return host ? { kind: 'host', id: host[1] } : undefined;
}

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

export function buildBoxDevice(gladys, { info, line } = {}) {
  const id = ids.box(gladys);
  const features = [
    feature(id, FEATURE.INTERNET, 'Internet connected', C.UNKNOWN, T.SENSOR.BINARY, {
      keep_history: false,
    }),
    feature(id, FEATURE.LINK_TYPE, 'Link type', C.TEXT, T.TEXT.TEXT, {
      min: 0,
      max: 0,
      keep_history: false,
    }),
    feature(id, FEATURE.IP, 'Public IP address', C.TEXT, T.TEXT.TEXT, {
      min: 0,
      max: 0,
      keep_history: false,
    }),
    feature(id, FEATURE.UPTIME, 'Uptime', C.DURATION, T.DURATION.INTEGER, {
      unit: U.HOURS,
      max: 100000,
      keep_history: false,
    }),
    feature(id, FEATURE.WIFI, 'Wi-Fi', C.SWITCH, T.SWITCH.BINARY, {
      read_only: false,
      has_feedback: true,
      keep_history: false,
    }),
    feature(id, FEATURE.GUEST_WIFI, 'Guest Wi-Fi', C.SWITCH, T.SWITCH.BINARY, {
      read_only: false,
      has_feedback: true,
      keep_history: false,
    }),
    feature(id, FEATURE.ONLINE, 'Devices online', C.COUNTER_SENSOR, T.SENSOR.INTEGER, {
      max: 1000,
    }),
    feature(id, FEATURE.WIFI_ONLINE, 'Wi-Fi devices online', C.COUNTER_SENSOR, T.SENSOR.INTEGER, {
      max: 1000,
    }),
    feature(id, FEATURE.MISSED_CALLS, 'Missed calls', C.COUNTER_SENSOR, T.SENSOR.INTEGER, {
      max: 10000,
    }),
    feature(id, FEATURE.LAST_CALL, 'Last call', C.TEXT, T.TEXT.TEXT, {
      min: 0,
      max: 0,
      keep_history: false,
    }),
  ];
  if (line?.available) {
    features.push(
      feature(id, FEATURE.DOWN, 'Download rate', C.DATARATE, T.DATARATE.RATE, {
        unit: U.MEGABITS_PER_SECOND,
        max: 100000,
      }),
      feature(id, FEATURE.UP, 'Upload rate', C.DATARATE, T.DATARATE.RATE, {
        unit: U.MEGABITS_PER_SECOND,
        max: 100000,
      }),
    );
  }
  return {
    name: info?.model ? `Livebox (${info.model})` : 'Livebox',
    external_id: id,
    features,
    params: [
      { name: 'model', value: info?.model ?? '' },
      { name: 'software', value: info?.software ?? '' },
    ],
  };
}

export function buildHostDevice(gladys, host) {
  const id = ids.host(gladys, host.mac);
  return {
    name: host.name,
    external_id: id,
    features: [feature(id, FEATURE.PRESENCE, 'Presence', C.PRESENCE_SENSOR, T.SENSOR.BINARY)],
    params: [
      { name: 'mac', value: host.mac },
      { name: 'type', value: host.type ?? '' },
      { name: 'ip', value: host.ip ?? '' },
      { name: 'interface', value: host.wireless ? 'wifi' : 'ethernet' },
    ],
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

export function boxStates(deviceId, { wan, info, wifi, guest, hosts, calls, line }) {
  const states = [];
  if (wan) {
    states.push(...state(deviceId, FEATURE.INTERNET, wan.connected ? 1 : 0));
    states.push(...state(deviceId, FEATURE.LINK_TYPE, wan.linkType ?? '—'));
    states.push(...state(deviceId, FEATURE.IP, wan.ip ?? '—'));
  }
  if (info?.uptimeSeconds !== null && info?.uptimeSeconds !== undefined) {
    states.push(...state(deviceId, FEATURE.UPTIME, Math.round(info.uptimeSeconds / 3600)));
  }
  if (wifi !== undefined) {
    states.push(...state(deviceId, FEATURE.WIFI, wifi ? 1 : 0));
  }
  if (guest !== undefined) {
    states.push(...state(deviceId, FEATURE.GUEST_WIFI, guest ? 1 : 0));
  }
  if (hosts) {
    const online = hosts.filter((h) => h.active);
    states.push(...state(deviceId, FEATURE.ONLINE, online.length));
    states.push(...state(deviceId, FEATURE.WIFI_ONLINE, online.filter((h) => h.wireless).length));
  }
  if (calls) {
    states.push(
      ...state(deviceId, FEATURE.MISSED_CALLS, calls.filter((c) => c.type === 'missed').length),
    );
    const last = calls[0];
    states.push(
      ...state(
        deviceId,
        FEATURE.LAST_CALL,
        last ? `${last.type}: ${last.name || last.number || '?'}` : '—',
      ),
    );
  }
  if (line?.available) {
    states.push(...state(deviceId, FEATURE.DOWN, line.downMbps));
    states.push(...state(deviceId, FEATURE.UP, line.upMbps));
  }
  return states;
}

export function hostStates(deviceId, host) {
  return state(deviceId, FEATURE.PRESENCE, host.active ? 1 : 0);
}
