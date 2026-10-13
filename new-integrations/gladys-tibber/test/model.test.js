import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cheapSlots,
  cheapestWindow,
  dailyTotals,
  halfHours,
  liveOf,
  localClock,
  localDate,
  priceState,
  slotAt,
  slotsOf,
  stats,
} from '../src/tibber/model.js';
import { intervalCosts, hoursToFetch, rangeStart } from '../src/energy.js';
import { cheapestWindowOutputs, priceOutputs } from '../src/scenes.js';
import {
  NOW,
  TODAY,
  TODAY_PRICES,
  TOMORROW,
  TOMORROW_PRICES,
  TZ,
  consumption,
  dayPrices,
  measurement,
} from './fixtures/tibber.js';

const slots = slotsOf([...dayPrices(TODAY, TODAY_PRICES), ...dayPrices(TOMORROW, TOMORROW_PRICES)]);

test('slots are sorted, deduplicated and given an end', () => {
  const dup = slotsOf([...dayPrices(TODAY, TODAY_PRICES), dayPrices(TODAY, TODAY_PRICES)[5]]);
  assert.equal(dup.length, 24);
  assert.equal(slots.length, 48);
  assert.equal(slots[0].startsAt, '2026-10-12T22:00:00.000Z');
  assert.equal(slots[0].endsAt, '2026-10-12T23:00:00.000Z');
  assert.equal(
    slots[47].endsAt,
    '2026-10-14T22:00:00.000Z',
    'the last slot keeps the previous length',
  );
  // 15-minute slots keep their length too.
  const quarter = slotsOf([
    { total: 1, startsAt: '2026-10-13T10:00:00Z', level: 'NORMAL' },
    { total: 2, startsAt: '2026-10-13T10:15:00Z', level: 'NORMAL' },
  ]);
  assert.equal(quarter[1].endsAt, '2026-10-13T10:30:00.000Z');
});

test('local dates and clocks follow the home time zone', () => {
  assert.equal(localDate(NOW, TZ), TODAY);
  assert.deepEqual(localClock(NOW, TZ), { hour: 12, minute: 0 });
  assert.equal(localDate(Date.parse('2026-10-13T22:30:00Z'), TZ), TOMORROW);
});

test('the price state at noon', () => {
  const price = priceState(slots, NOW, { timeZone: TZ, cheapHours: 4 });
  assert.equal(price.slot.price, 0.9);
  assert.equal(price.slot.level, 'NORMAL');
  assert.equal(price.next.price, 0.85);
  assert.equal(
    Math.round(price.stats.avg * 1000) / 1000,
    Math.round((TODAY_PRICES.reduce((a, b) => a + b) / 24) * 1000) / 1000,
  );
  assert.equal(price.stats.min, 0.49);
  assert.equal(price.stats.max, 1.8);
  assert.equal(price.cheap, false);
  assert.deepEqual([...price.cheapSlots].sort(), [
    '2026-10-12T23:00:00.000Z',
    '2026-10-13T00:00:00.000Z',
    '2026-10-13T01:00:00.000Z',
    '2026-10-13T02:00:00.000Z',
  ]);
  assert.equal(price.tomorrow.slots.length, 24);
  assert.equal(price.tomorrow.stats.min, 0.25);
  assert.equal(
    priceState(slots, Date.parse('2026-10-15T00:00:00Z'), { timeZone: TZ, cheapHours: 4 }),
    undefined,
  );
  assert.equal(slotAt(slots, Date.parse('2026-10-13T03:30:00Z')).price, 0.6);
  assert.equal(stats([]), null);
  assert.equal(cheapSlots([], 4).size, 0);
});

test('the cheapest consecutive window', () => {
  const window = cheapestWindow(slots.slice(0, 24), 3);
  assert.equal(window.start, '2026-10-13T00:00:00.000Z');
  assert.equal(window.end, '2026-10-13T03:00:00.000Z');
  assert.equal(Math.round(window.avg * 100) / 100, 0.5);
  assert.equal(cheapestWindow(slots.slice(0, 2), 3), undefined);
  // A gap breaks the consecutiveness.
  const gap = [slots[0], slots[2], slots[3]];
  assert.equal(cheapestWindow(gap, 2).start, slots[2].startsAt);
});

test('hourly consumption becomes 30-minute halves, and daily totals', () => {
  const nodes = consumption();
  const halves = halfHours(nodes);
  assert.equal(halves.length, 47 * 2, 'the incomplete hour is skipped');
  assert.equal(halves[0].kwh, 0.75);
  assert.equal(halves[1].starts_at, '2026-10-11T10:30:00.000Z');
  const totals = dailyTotals(nodes, TZ, NOW);
  assert.equal(totals.todayKwh, 1.5 * 11, '00:00 to 11:00 local');
  assert.equal(Math.round(totals.todayCost * 100) / 100, 13.2);
  assert.equal(totals.yesterdayKwh, 1.5 * 24);
});

test('live measurements', () => {
  const live = liveOf(measurement(1500));
  assert.equal(live.power, 1500);
  assert.deepEqual(live.voltage, [230.1, 231.5, 229.9]);
  assert.equal(live.signalStrength, -62);
  assert.equal(liveOf({}).power, null);
});

test('delegated pricing of 30-minute intervals', () => {
  const intervals = [
    { starts_at: '2026-10-13T09:00:00Z', kwh: 1 },
    { starts_at: '2026-10-13T09:30:00Z', kwh: 2 },
    { starts_at: '2026-10-13T12:00:00Z', kwh: 1 },
  ];
  assert.equal(rangeStart(intervals), '2026-10-13T08:00:00.000Z');
  assert.equal(hoursToFetch(intervals), 6);
  const costs = intervalCosts(intervals, dayPrices(TODAY, TODAY_PRICES), { fallbackPrice: 1 });
  assert.deepEqual(costs[0], { starts_at: '2026-10-13T09:00:00Z', cost: 0.95, label: 'Tibber' });
  assert.equal(costs[1].cost, 1.9);
  assert.equal(costs[2].cost, 0.88);
  const missing = intervalCosts(
    [{ starts_at: '2026-11-01T00:00:00Z', kwh: 2 }],
    dayPrices(TODAY, TODAY_PRICES),
    { fallbackPrice: 0.5 },
  );
  assert.deepEqual(missing[0], { starts_at: '2026-11-01T00:00:00Z', cost: 1, label: 'Fallback' });
  assert.throws(
    () => intervalCosts([{ starts_at: '2026-11-01T00:00:00Z', kwh: 2 }], []),
    /No Tibber price/,
  );
});

test('scene outputs', () => {
  const price = priceState(slots, NOW, { timeZone: TZ, cheapHours: 4 });
  price.allSlots = slots;
  const out = priceOutputs(price, { timeZone: TZ, cheapHours: 4 });
  assert.equal(out.available, true);
  assert.equal(out.price, 0.9);
  assert.equal(out.ends_time, '13:00');
  assert.equal(out.tomorrow_published, true);
  assert.equal(out.window_start_time, '01:00', 'the cheapest 4 hours ahead are tomorrow night');
  assert.deepEqual(priceOutputs(undefined, { timeZone: TZ, cheapHours: 4 }), { available: false });
  const window = cheapestWindowOutputs(slots, {
    period: 'tomorrow',
    hours: 2,
    now: NOW,
    timeZone: TZ,
  });
  assert.equal(window.found, true);
  assert.equal(window.start_time, '02:00');
  assert.equal(window.end_time, '04:00');
  assert.ok(window.saving_percent > 0);
  const today = cheapestWindowOutputs(slots, { period: 'today', hours: 1, now: NOW, timeZone: TZ });
  assert.equal(today.start_time, '23:00');
  assert.equal(
    cheapestWindowOutputs([], { period: 'next_24h', hours: 2, now: NOW, timeZone: TZ }).found,
    false,
  );
});
