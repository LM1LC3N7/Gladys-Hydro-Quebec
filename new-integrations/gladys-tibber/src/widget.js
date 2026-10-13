// -----------------------------------------------------------------------------
// The dashboard widgets: "Tibber prices" and "Tibber live". Pure.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURE, ids } from './devices.js';
import { T } from './i18n.js';
import { cheapestWindow, localClock } from './tibber/model.js';

const pick = (text, language) => (typeof text === 'string' ? text : (text[language] ?? text.en));
const money = (value, currency) =>
  value === null || value === undefined ? '—' : `${value.toFixed(4)} ${currency ?? ''}`.trim();
const hhmm = (iso, timeZone) => {
  const { hour, minute } = localClock(Date.parse(iso), timeZone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const LEVEL_COLORS = {
  VERY_CHEAP: WIDGET_COLORS.SUCCESS,
  CHEAP: WIDGET_COLORS.SUCCESS,
  NORMAL: WIDGET_COLORS.NEUTRAL,
  EXPENSIVE: WIDGET_COLORS.WARNING,
  VERY_EXPENSIVE: WIDGET_COLORS.DANGER,
};

export function pricesWidget({ home, slots, price, cheapHours, now, language = 'en' }) {
  const components = [{ type: 'text', text: `Tibber ${home.name}`, variant: 'heading' }];
  if (!price) {
    components.push({ type: 'text', text: T.widget.noData, variant: 'body' });
    return { ttl_seconds: 60, components };
  }
  const currency = price.slot.currency ?? home.currency;
  components.push({
    type: 'value',
    label: T.widget.now,
    value: price.slot.price.toFixed(4),
    unit: currency,
    color: LEVEL_COLORS[price.slot.level],
  });
  components.push({
    type: 'value',
    label: T.widget.next,
    value: price.next ? price.next.price.toFixed(4) : '—',
    unit: currency,
  });
  components.push({
    type: 'value',
    label: T.widget.today,
    value: price.stats ? price.stats.avg.toFixed(4) : '—',
    unit: currency,
  });
  if (price.tomorrow) {
    components.push({
      type: 'value',
      label: T.widget.tomorrow,
      value: price.tomorrow.stats.avg.toFixed(4),
      unit: currency,
    });
  }
  const nowIso = new Date(now).toISOString();
  const upcoming = slots.filter((s) => s.endsAt > nowIso);
  const window = cheapestWindow(upcoming.slice(0, 96), cheapHours);
  const items = [
    {
      label: T.widget.levelRow,
      value: pick(T.level[price.slot.level], language),
      color: LEVEL_COLORS[price.slot.level],
      icon: 'activity',
    },
  ];
  if (window) {
    items.push({
      label: pick(T.widget.cheapest(cheapHours), language),
      value:
        `${hhmm(window.start, home.timeZone)} – ${hhmm(window.end, home.timeZone)} · ${money(window.avg, currency)}`.slice(
          0,
          40,
        ),
      icon: 'clock',
      color: WIDGET_COLORS.SUCCESS,
    });
  }
  items.push({
    label: T.widget.tomorrowRow,
    value: pick(price.tomorrow ? T.widget.published : T.widget.notYet, language),
    icon: 'calendar',
    color: price.tomorrow ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
  });
  components.push({ type: 'status', items });
  const points = slots
    .slice(-300)
    .map((s) => ({ t: s.startsAt, v: Math.round(s.price * 10000) / 10000 }));
  if (points.length > 1) {
    components.push({
      type: 'chart',
      chart_type: 'stepline',
      title: T.widget.chart,
      unit: currency,
      now_marker: true,
      series: [{ name: `${currency}/kWh`, points }],
    });
  }
  return { ttl_seconds: 300, components };
}

export function liveWidget({ gladys, home, live, liveEnabled, language = 'en' }) {
  const components = [{ type: 'text', text: `Tibber ${home.name}`, variant: 'heading' }];
  if (!liveEnabled) {
    components.push({ type: 'text', text: T.widget.liveOff, variant: 'body' });
    return { ttl_seconds: 600, components };
  }
  if (!live) {
    components.push({ type: 'text', text: T.widget.noLive, variant: 'body' });
    return { ttl_seconds: 30, components };
  }
  const id = ids.home(gladys, home.id);
  const max = Math.max(3000, Math.ceil((live.maxPower ?? live.power ?? 0) / 1000) * 1000);
  components.push({
    type: 'gauge',
    label: T.widget.power,
    device_feature: ids.feature(id, FEATURE.POWER),
    min: 0,
    max,
    unit: 'W',
    color: (live.power ?? 0) > max * 0.7 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.PRIMARY,
  });
  components.push({
    type: 'value',
    label: T.widget.todayKwh,
    device_feature: ids.feature(id, FEATURE.TODAY_KWH),
    icon: 'zap',
  });
  components.push({
    type: 'value',
    label: T.widget.todayCost,
    device_feature: ids.feature(id, FEATURE.TODAY_COST),
    icon: 'credit-card',
  });
  if ((live.powerProduction ?? 0) > 0 || (live.accumulatedProduction ?? 0) > 0) {
    components.push({
      type: 'value',
      label: T.widget.production,
      device_feature: ids.feature(id, FEATURE.PRODUCTION),
      icon: 'sun',
    });
  }
  const items = [];
  if (live.maxPower !== null) {
    items.push({
      label: T.widget.peak,
      value: `${Math.round(live.maxPower)} W`,
      icon: 'trending-up',
    });
  }
  if (live.averagePower !== null) {
    items.push({
      label: T.widget.average,
      value: `${Math.round(live.averagePower)} W`,
      icon: 'bar-chart-2',
    });
  }
  const volts = live.voltage.filter((v) => v !== null);
  if (volts.length > 0) {
    items.push({
      label: T.widget.voltage,
      value: volts.map((v) => `${Math.round(v)} V`).join(' / '),
      icon: 'activity',
    });
  }
  const amps = live.current.filter((v) => v !== null);
  if (amps.length > 0) {
    items.push({
      label: T.widget.current,
      value: amps.map((v) => `${v.toFixed(1)} A`).join(' / '),
      icon: 'activity',
    });
  }
  if (live.signalStrength !== null) {
    items.push({
      label: T.widget.signal,
      value: `${live.signalStrength} dBm`,
      icon: 'wifi',
      color: live.signalStrength < -80 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }
  void language;
  return { ttl_seconds: 30, components };
}
