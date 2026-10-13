// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys, a fake Tibber API and a fake
// websocket.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { TibberApp } from '../src/app.js';
import { ACTIONS, SCENE_ACTIONS, SCENE_TRIGGERS, WIDGETS } from '../src/constants.js';
import { LiveSubscription } from '../src/tibber/live.js';
import { installFetch, json } from './helpers/fakeFetch.js';
import { createSocketFactory } from './helpers/fakeSocket.js';
import { createFakeTimers } from './helpers/fakeTimers.js';
import {
  HOME_ID,
  NOW,
  TODAY,
  TODAY_PRICES,
  consumption,
  dayPrices,
  measurement,
  priceInfo,
  viewer,
} from './fixtures/tibber.js';

const quiet = {
  info() {},
  warn: (...a) => process.env.DEBUG_TEST && console.error(...a),
  error() {},
  debug() {},
};

let fake;
afterEach(() => fake?.restore());

const HOME = `ext:tibber:home:${HOME_ID}`;
const gql = (data) => json({ data });

function setup({
  config = { access_token: 'tok' },
  routes = {},
  now = NOW,
  realTime = true,
  devices = [],
} = {}) {
  const state = { tomorrow: true };
  fake = installFetch({
    viewer: () => gql({ viewer: viewer({ realTimeConsumptionEnabled: realTime }) }),
    prices: () =>
      gql({
        viewer: {
          home: { currentSubscription: { priceInfo: priceInfo({ tomorrow: state.tomorrow }) } },
        },
      }),
    consumption: () => gql({ viewer: { home: { consumption: { nodes: consumption() } } } }),
    priceRange: ({ variables }) =>
      gql({
        viewer: {
          home: {
            currentSubscription: {
              priceInfoRange: {
                edges: dayPrices(TODAY, TODAY_PRICES)
                  .map((node) => ({ node }))
                  .slice(0, variables.first),
              },
            },
          },
        },
      }),
    ...routes,
  });
  const gladys = createFakeGladys({ selector: 'tibber', config, devices });
  const timers = createFakeTimers();
  const clock = { now };
  const sockets = createSocketFactory();
  const app = new TibberApp({
    gladys,
    logger: quiet,
    now: () => clock.now,
    timers,
    liveFactory: (options) =>
      new LiveSubscription({ ...options, socketFactory: sockets.factory, timers }),
  });
  gladys.onScanRequest(() => app.discover());
  gladys.onSceneAction(SCENE_ACTIONS.GET_PRICE, (f) => app.getPrice(f));
  gladys.onSceneAction(SCENE_ACTIONS.CHEAPEST_WINDOW, (f) => app.getCheapestWindow(f));
  for (const key of Object.values(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => app.getWidget(key, request));
  }
  gladys.onEnergyPrice((request) => app.energyPrice(request));
  gladys.onEnergyCurrent((request) => app.energyCurrent(request));
  gladys.onAction(ACTIONS.TEST, () => app.testConnection());
  return { app, gladys, timers, clock, state, sockets };
}

test('no token: the status says so', async () => {
  const { app, gladys } = setup({ config: {} });
  await app.start({});
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Aucun jeton/);
  assert.equal(fake.calls.length, 0);
});

test('start discovers the home, publishes the prices and schedules everything', async () => {
  const { app, gladys, timers, sockets } = setup();
  await app.start({ access_token: 'tok' });
  assert.equal(fake.calls[0].headers.Authorization, 'Bearer tok');
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.external_id, HOME);
  assert.equal(device.name, 'Tibber Hytta');
  const keys = device.features.map((f) => f.external_id.split(':').at(-1));
  assert.ok(keys.includes('price') && keys.includes('consumption') && keys.includes('power'));
  assert.equal(
    device.features.find((f) => f.external_id.endsWith(':price')).unit,
    undefined,
    'NOK has no Gladys unit',
  );
  assert.equal(gladys.fake.lastState(`${HOME}:price`), 0.9);
  assert.equal(gladys.fake.lastState(`${HOME}:price_level`), 'NORMAL');
  assert.equal(gladys.fake.lastState(`${HOME}:next_price`), 0.85);
  assert.equal(gladys.fake.lastState(`${HOME}:min_price`), 0.49);
  assert.equal(gladys.fake.lastState(`${HOME}:cheap_period`), 0);
  assert.equal(gladys.fake.lastState(`${HOME}:yesterday_consumption`), 36);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /1 home/);
  assert.equal(timers.intervals().length, 2, 'prices and consumption');
  const tick = timers.timeouts().find((t) => t.ms > 1000);
  assert.ok(tick && tick.ms <= 60 * 60_000 + 500, 'a tick at the end of the slot');
  assert.equal(sockets.sockets.length, 1, 'the live subscription opened');
  assert.equal(gladys.fake.sceneEvents.length, 0, 'nothing on the first reading');
  await app.stop();
  assert.equal(timers.pending.size, 0);
  assert.equal(sockets.sockets[0].closed, true);
});

test('the energy consumption is published once the device exists', async () => {
  const { app, gladys } = setup({
    devices: [
      {
        external_id: HOME,
        name: 'Tibber Hytta',
        features: [
          {
            external_id: `${HOME}:consumption`,
            category: 'energy-sensor',
            type: 'thirty-minutes-consumption',
          },
        ],
      },
    ],
  });
  await gladys.connect();
  await app.start({ access_token: 'tok' });
  const published = gladys.fake.publishedEnergyConsumption;
  assert.ok(published.length > 0, 'publishEnergyConsumption was called');
  assert.equal(
    published[0].feature ?? published[0].external_id ?? published[0].device_feature_external_id,
    `${HOME}:consumption`,
  );
});

test('the tick moves the sensors and fires the cheap / level transitions', async () => {
  const { app, gladys, timers, clock } = setup();
  await app.start({ access_token: 'tok' });
  // 23:00 local (21:00Z): the cheapest 4 hours of the day start at 01:00 local... move to 01:30 local tomorrow.
  clock.now = Date.parse('2026-10-13T23:30:00Z');
  await timers.runTimeouts();
  assert.equal(gladys.fake.lastState(`${HOME}:price`), 0.26);
  const keys = gladys.fake.sceneEvents.map((e) => e.key);
  assert.ok(keys.includes(SCENE_TRIGGERS.CHEAP_STARTED));
  assert.ok(keys.includes(SCENE_TRIGGERS.LEVEL_CHANGED));
  const level = gladys.fake.sceneEvents.find((e) => e.key === SCENE_TRIGGERS.LEVEL_CHANGED);
  assert.equal(level.data.previous_level, 'NORMAL');
  assert.equal(level.data.level, 'VERY_CHEAP');
  assert.equal(level.data.device, HOME);
});

test('tomorrow: retried every 10 minutes after 12:45, announced once', async () => {
  const { app, gladys, timers, state } = setup({ now: Date.parse('2026-10-13T11:00:00Z') });
  state.tomorrow = false;
  await app.start({ access_token: 'tok' });
  const retry = timers.timeouts().find((t) => t.ms === 10 * 60_000);
  assert.ok(retry, 'a retry in 10 minutes');
  state.tomorrow = true;
  await retry.fn();
  const events = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.TOMORROW);
  assert.equal(events.length, 1);
  assert.equal(events[0].data.currency, 'NOK');
  assert.equal(events[0].data.min, 0.25);
  assert.ok(events[0].data.cheapest_start < events[0].data.cheapest_end);
  await timers.runIntervals();
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.TOMORROW).length, 1);
});

test('live measurements are throttled, published and fire the power marks', async () => {
  const { app, gladys, sockets, clock } = setup();
  await app.start({ access_token: 'tok' });
  const [socket] = sockets.sockets;
  socket.open();
  socket.receive({ type: 'connection_ack' });
  assert.match(gladys.fake.connectionStatus.message.en, /live power on Hytta/);
  socket.receive({
    id: '1',
    type: 'next',
    payload: { data: { liveMeasurement: measurement(800) } },
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(gladys.fake.lastState(`${HOME}:power`), 800);
  assert.equal(gladys.fake.lastState(`${HOME}:voltage_l1`), 230.1);
  assert.equal(gladys.fake.lastState(`${HOME}:today_consumption`), 12.345);
  // 2 seconds later: throttled, nothing published.
  clock.now = NOW + 2000;
  socket.receive({
    id: '1',
    type: 'next',
    payload: { data: { liveMeasurement: measurement(3500) } },
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(gladys.fake.lastState(`${HOME}:power`), 800);
  clock.now = NOW + 11_000;
  socket.receive({
    id: '1',
    type: 'next',
    payload: { data: { liveMeasurement: measurement(3500) } },
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(gladys.fake.lastState(`${HOME}:power`), 3500);
  const marks = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.POWER);
  assert.deepEqual(
    marks.map((e) => [e.data.threshold, e.data.direction]),
    [
      ['1000', 'above'],
      ['2000', 'above'],
      ['3000', 'above'],
    ],
  );
  const widget = (await gladys.fake.widgetGet(WIDGETS.LIVE, { settings: { device: HOME } })).data
    .content;
  assert.equal(widget.components.find((c) => c.type === 'gauge').device_feature, `${HOME}:power`);
  await app.stop();
});

test('no Pulse: no socket, and the live widget says so', async () => {
  const { app, gladys, sockets } = setup({ realTime: false });
  await app.start({ access_token: 'tok' });
  assert.equal(sockets.sockets.length, 0);
  assert.ok(
    !gladys.fake.discoveredDevices[0].features.some((f) => f.external_id.endsWith(':power')),
  );
  const widget = (await gladys.fake.widgetGet(WIDGETS.LIVE, { settings: { device: HOME } })).data
    .content;
  assert.match(widget.components[1].text.en, /disabled/);
});

test('scene actions and the prices widget', async () => {
  const { app, gladys } = setup();
  await app.start({ access_token: 'tok' });
  const price = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_PRICE, { device: HOME });
  assert.equal(price.data.outputs.price, 0.9);
  assert.equal(price.data.outputs.level, 'NORMAL');
  assert.equal(price.data.outputs.tomorrow_published, true);
  const window = await gladys.fake.sceneAction(SCENE_ACTIONS.CHEAPEST_WINDOW, {
    device: HOME,
    hours: 3,
    period: 'tomorrow',
  });
  assert.equal(window.data.outputs.found, true);
  assert.equal(window.data.outputs.start_time, '01:00');
  const widget = (
    await gladys.fake.widgetGet(WIDGETS.PRICES, { settings: { device: HOME }, language: 'fr' })
  ).data.content;
  assert.equal(widget.components[0].text, 'Tibber Hytta');
  assert.equal(widget.components.filter((c) => c.type === 'value').length, 4);
  assert.equal(widget.components.find((c) => c.type === 'chart').series[0].points.length, 48);
  assert.equal(widget.components.find((c) => c.type === 'status').items[0].value, 'Normal');
  const none = (await gladys.fake.widgetGet(WIDGETS.PRICES, { settings: {} })).data.content;
  assert.match(none.components[0].text.fr, /Choisissez une maison/);
  const bad = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_PRICE, {
    device: 'ext:tibber:home:nope',
  });
  assert.equal(bad.success, false);
});

test('the delegated contract prices the intervals from the price history', async () => {
  const { app, gladys } = setup();
  await app.start({ access_token: 'tok' });
  const contract = {
    id: 'c1',
    template_key: 'tibber-no',
    inputs: { home_id: '', subscription: 39, fallback_price: 1 },
    currency: 'NOK',
    timezone: 'Europe/Oslo',
    billing_period_start_day: 1,
  };
  const ack = await gladys.fake.energyPrice({
    contract,
    billing_period: { starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-11-01T00:00:00Z' },
    cumulative_before: { day: 0, month: 0, billing_period: 0 },
    intervals: [
      { starts_at: '2026-10-13T09:00:00Z', kwh: 1, max_power_kw: 2 },
      { starts_at: '2026-10-13T09:30:00Z', kwh: 0.5, max_power_kw: 1 },
    ],
  });
  assert.equal(ack.success, true);
  assert.deepEqual(
    ack.data.costs.map((c) => c.cost),
    [1.0, 0.5],
  );
  const range = fake.calls.find((c) => c.name === 'priceRange');
  assert.equal(range.variables.homeId, HOME_ID);
  assert.equal(Buffer.from(range.variables.after, 'base64').toString(), '2026-10-13T08:00:00.000Z');
  const current = await gladys.fake.energyCurrent({
    contract,
    billing_period: {},
    cumulative: {},
    max_power_kw: 0,
  });
  assert.equal(current.data.price, 0.9);
  assert.equal(current.data.valid_until, '2026-10-13T11:00:00.000Z');
  assert.equal(current.data.next_price, 0.85);
});

test('a refused token stops the integration and says so', async () => {
  const { app, gladys, timers } = setup({
    routes: {
      viewer: () =>
        json({
          errors: [{ message: 'invalid token', extensions: { code: 'UNAUTHENTICATED' } }],
          data: null,
        }),
    },
  });
  await app.start({ access_token: 'bad' });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the access token/);
  assert.equal(timers.intervals().length, 0);
  const test = await gladys.fake.action(ACTIONS.TEST);
  assert.match(test.data.message.fr, /a refusé le jeton/);
});

test('the test button lists the homes and their current price', async () => {
  const { app, gladys } = setup();
  await app.start({ access_token: 'tok' });
  const ack = await gladys.fake.action(ACTIONS.TEST);
  assert.match(ack.data.message.en, /Jane Doe. Hytta: 0.9 NOK\/kWh \(NORMAL\)/);
});
