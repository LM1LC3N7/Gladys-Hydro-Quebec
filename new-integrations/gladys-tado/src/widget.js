// -----------------------------------------------------------------------------
// The dashboard widgets: "tado° home" and "tado° zone". Pure: build the
// content from the last reading; the tiles bound to a device feature follow
// the published states live.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { TEMPERATURE } from './constants.js';
import { FEATURE, ids, thermostatMode } from './devices.js';
import { T, weatherLabel } from './i18n.js';
import { ZONE_TYPES, isActive } from './tado/model.js';
import { THERMOSTAT_MODE } from './constants.js';

const pick = (text, language) => (typeof text === 'string' ? text : (text[language] ?? text.en));

function modeLabel(zone, language) {
  const mode = thermostatMode(zone);
  if (mode === THERMOSTAT_MODE.OFF) {
    return pick(T.mode.off, language);
  }
  if (mode === THERMOSTAT_MODE.AUTO) {
    return pick(T.mode.schedule, language);
  }
  const type = zone.overlay?.type;
  if (type === 'TIMER') {
    return pick(T.mode.timer, language);
  }
  if (type === 'NEXT_TIME_BLOCK') {
    return pick(T.mode.untilNext, language);
  }
  return pick(T.mode.manual, language);
}

function timeOf(iso, language, timeZone) {
  if (!iso) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timeZone || undefined,
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

/** The "zone" widget. `zone` undefined: nothing read yet. */
export function zoneWidget({ gladys, home, zone, language = 'en' }) {
  if (!zone) {
    return {
      ttl_seconds: 30,
      components: [{ type: 'text', text: T.widget.notLoaded, variant: 'body' }],
    };
  }
  const id = ids.zone(gladys, home.id, zone.id);
  const f = (key) => ids.feature(id, key);
  const components = [{ type: 'text', text: zone.name, variant: 'heading' }];
  const hotWater = zone.type === ZONE_TYPES.HOT_WATER;
  if (!hotWater) {
    components.push({
      type: 'value',
      label: T.widget.temperature,
      device_feature: f(FEATURE.TEMPERATURE),
      icon: 'thermometer',
    });
    components.push({
      type: 'value',
      label: T.widget.humidity,
      device_feature: f(FEATURE.HUMIDITY),
      icon: 'droplet',
    });
  }
  components.push({
    type: 'value',
    label: T.widget.target,
    value: zone.targetTemperature ?? '—',
    unit: zone.targetTemperature === null ? undefined : '°C',
    icon: 'target',
    color: isActive(zone) ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
  });
  if (zone.type === ZONE_TYPES.HEATING) {
    components.push({
      type: 'gauge',
      label: T.widget.heatingPower,
      value: zone.heatingPower ?? 0,
      min: 0,
      max: 100,
      unit: '%',
      color: isActive(zone) ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }
  const items = [{ label: T.widget.mode, value: modeLabel(zone, language), icon: 'clock' }];
  const next = timeOf(zone.nextChange?.start, language, home.timeZone);
  if (
    next &&
    zone.nextChange?.targetTemperature !== null &&
    zone.nextChange?.targetTemperature !== undefined
  ) {
    items.push({
      label: T.widget.nextChange,
      value: `${next} → ${zone.nextChange.targetTemperature} °C`,
    });
  }
  if (zone.openWindow) {
    items.push({
      label: T.widget.openWindow,
      value: pick(T.widget.yes, language),
      icon: 'wind',
      color: WIDGET_COLORS.WARNING,
    });
  }
  if (zone.lowBattery) {
    items.push({
      label: T.widget.lowBattery,
      value: pick(T.widget.yes, language),
      icon: 'battery',
      color: WIDGET_COLORS.DANGER,
    });
  }
  if (!zone.online) {
    items.push({
      label: T.widget.offline,
      value: pick(T.widget.yes, language),
      icon: 'wifi-off',
      color: WIDGET_COLORS.DANGER,
    });
  }
  components.push({ type: 'status', items });
  const target = zone.targetTemperature ?? zone.nextChange?.targetTemperature ?? 20;
  if (!hotWater) {
    components.push({
      type: 'button',
      label: T.widget.cooler,
      icon: 'minus',
      style: 'secondary',
      action: {
        key: 'target',
        params: { target: Math.max(TEMPERATURE.MIN, target - TEMPERATURE.STEP) },
      },
    });
    components.push({
      type: 'button',
      label: T.widget.warmer,
      icon: 'plus',
      style: 'secondary',
      action: {
        key: 'target',
        params: {
          target: Math.min(
            zone.type === ZONE_TYPES.AC ? 30 : TEMPERATURE.MAX,
            target + TEMPERATURE.STEP,
          ),
        },
      },
    });
  }
  components.push({
    type: 'button',
    label: T.widget.resume,
    icon: 'calendar',
    style: 'primary',
    action: { key: 'resume' },
  });
  components.push({
    type: 'button',
    label: T.widget.off,
    icon: 'power',
    style: 'danger',
    action: { key: 'off', confirm: true },
  });
  return { ttl_seconds: 60, components };
}

/** The "home" widget: presence, outside weather, the zones at a glance. */
export function homeWidget({ gladys, home, reading, language = 'en' }) {
  if (!reading) {
    return {
      ttl_seconds: 30,
      components: [{ type: 'text', text: T.widget.notLoaded, variant: 'body' }],
    };
  }
  const homeId = ids.home(gladys, home.id);
  const components = [{ type: 'text', text: home.name, variant: 'heading' }];
  components.push({
    type: 'value',
    label: T.widget.outside,
    device_feature: ids.feature(homeId, FEATURE.OUTSIDE_TEMPERATURE),
    icon: 'cloud',
  });
  const zones = [...reading.zones.values()]
    .filter((z) => z.type !== ZONE_TYPES.HOT_WATER)
    .slice(0, 5);
  for (const zone of zones) {
    components.push({
      type: 'value',
      label: zone.name.slice(0, 24),
      device_feature: ids.feature(ids.zone(gladys, home.id, zone.id), FEATURE.TEMPERATURE),
      icon: isActive(zone) ? 'zap' : 'thermometer',
      color: isActive(zone) ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }
  const presence = reading.presence;
  const items = [
    {
      label: T.widget.presence,
      value:
        pick(T.presence[presence?.presence ?? 'unknown'], language) +
        (presence?.locked ? ' 🔒' : ''),
      icon: presence?.presence === 'home' ? 'home' : 'log-out',
      color: presence?.presence === 'home' ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (reading.weather?.state) {
    items.push({
      label: pick(T.widget.outside, language),
      value: pick(weatherLabel(reading.weather.state), language),
      icon: 'sun',
    });
  }
  const heating = [...reading.zones.values()].filter(isActive).map((z) => z.name);
  items.push({
    label: pick(T.widget.heatingPower, language),
    value: heating.length > 0 ? heating.join(', ').slice(0, 40) : pick(T.widget.no, language),
    icon: 'zap',
    color: heating.length > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
  });
  const windows = [...reading.zones.values()].filter((z) => z.openWindow).map((z) => z.name);
  if (windows.length > 0) {
    items.push({
      label: T.widget.openWindow,
      value: windows.join(', ').slice(0, 40),
      icon: 'wind',
      color: WIDGET_COLORS.WARNING,
    });
  }
  components.push({ type: 'status', items });
  components.push({
    type: 'button',
    label: T.widget.home,
    icon: 'home',
    style: 'primary',
    action: { key: 'presence', params: { mode: 'home' } },
  });
  components.push({
    type: 'button',
    label: T.widget.away,
    icon: 'log-out',
    style: 'secondary',
    action: { key: 'presence', params: { mode: 'away' } },
  });
  components.push({
    type: 'button',
    label: T.widget.auto,
    icon: 'map-pin',
    style: 'secondary',
    action: { key: 'presence', params: { mode: 'auto' } },
  });
  return { ttl_seconds: 60, components };
}
