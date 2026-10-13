// -----------------------------------------------------------------------------
// The dashboard widgets: "Livebox" (the box) and "Livebox devices". Pure.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURE, ids } from './devices.js';
import { T } from './i18n.js';

const pick = (text, language) => (typeof text === 'string' ? text : (text[language] ?? text.en));

function uptimeText(seconds, language) {
  if (seconds === null || seconds === undefined) {
    return '—';
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return language === 'fr' ? `${days} j ${hours} h` : `${days} d ${hours} h`;
}

export function networkWidget({ gladys, reading, language = 'en' }) {
  const components = [{ type: 'text', text: 'Livebox', variant: 'heading' }];
  if (!reading?.wan) {
    components.push({ type: 'text', text: T.widget.notLoaded, variant: 'body' });
    return { ttl_seconds: 30, components };
  }
  const id = ids.box(gladys);
  const { wan, info, wifi, guest, hosts = [], calls = [], line } = reading;
  const online = hosts.filter((h) => h.active);
  components.push({
    type: 'value',
    label: T.widget.online,
    device_feature: ids.feature(id, FEATURE.ONLINE),
    icon: 'monitor',
  });
  components.push({
    type: 'value',
    label: T.widget.wifiOnline,
    device_feature: ids.feature(id, FEATURE.WIFI_ONLINE),
    icon: 'wifi',
  });
  if (calls.length > 0) {
    components.push({
      type: 'value',
      label: T.widget.missed,
      device_feature: ids.feature(id, FEATURE.MISSED_CALLS),
      icon: 'phone-missed',
    });
  }
  const items = [
    {
      label: T.widget.internet,
      value: pick(wan.connected ? T.widget.up : T.widget.down, language),
      icon: 'globe',
      color: wan.connected ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
    },
  ];
  if (wan.linkType || wan.ip) {
    items.push({
      label: T.widget.link,
      value: `${(wan.linkType ?? '').toUpperCase()} ${wan.ip ?? ''}`.trim().slice(0, 40),
      icon: 'link',
    });
  }
  if (line?.available) {
    items.push({
      label: T.widget.rate,
      value: `↓ ${line.downMbps ?? '?'} / ↑ ${line.upMbps ?? '?'} Mb/s`,
      icon: 'activity',
    });
  }
  if (info?.uptimeSeconds !== null && info?.uptimeSeconds !== undefined) {
    items.push({
      label: T.widget.uptime,
      value: uptimeText(info.uptimeSeconds, language),
      icon: 'clock',
    });
  }
  items.push({
    label: T.widget.wifi,
    value: pick(wifi ? T.widget.on : T.widget.off, language),
    icon: 'wifi',
    color: wifi ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
  });
  items.push({
    label: T.widget.guest,
    value: pick(guest ? T.widget.on : T.widget.off, language),
    icon: 'users',
    color: guest ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
  });
  components.push({ type: 'status', items });
  components.push({
    type: 'button',
    label: wifi ? T.widget.wifiOff : T.widget.wifiOn,
    icon: 'wifi',
    style: 'secondary',
    device_feature: ids.feature(id, FEATURE.WIFI),
    value: wifi ? 0 : 1,
  });
  components.push({
    type: 'button',
    label: guest ? T.widget.guestOff : T.widget.guestOn,
    icon: 'users',
    style: 'secondary',
    device_feature: ids.feature(id, FEATURE.GUEST_WIFI),
    value: guest ? 0 : 1,
  });
  void online;
  return { ttl_seconds: 60, components };
}

export function devicesWidget({ reading, language = 'en' }) {
  const components = [{ type: 'text', text: T.widget.devices, variant: 'heading' }];
  const online = (reading?.hosts ?? [])
    .filter((h) => h.active)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!reading) {
    components.push({ type: 'text', text: T.widget.notLoaded, variant: 'body' });
  } else if (online.length === 0) {
    components.push({ type: 'text', text: T.widget.noDevice, variant: 'body' });
  } else {
    components.push({
      type: 'status',
      items: online.slice(0, 10).map((h) => ({
        label: h.name.slice(0, 40),
        value: `${h.ip ?? ''}${h.wireless ? ' · Wi-Fi' : ' · LAN'}`.trim().slice(0, 40),
        icon: h.wireless ? 'wifi' : 'server',
        color: WIDGET_COLORS.SUCCESS,
      })),
    });
    if (online.length > 10) {
      components.push({
        type: 'text',
        text: language === 'fr' ? `+ ${online.length - 10} autres` : `+ ${online.length - 10} more`,
        variant: 'caption',
      });
    }
  }
  return { ttl_seconds: 60, components };
}
