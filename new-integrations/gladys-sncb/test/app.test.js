// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys and a fake iRail.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { SncbApp } from '../src/app.js';
import { ACTIONS, SCENE_ACTIONS, SCENE_TRIGGERS, WIDGETS } from '../src/constants.js';
import { FIXTURE_NOW, fixture, installFetch, json, liveboard } from './helpers/fakeFetch.js';
import { createFakeTimers } from './helpers/fakeTimers.js';

const quiet = {
  info() {},
  warn: (...a) => process.env.DEBUG_TEST && console.error(...a),
  error() {},
  debug() {},
};

let fake;
afterEach(() => fake?.restore());

const NAMUR = 'ext:sncb:station:BE.NMBS.008863008';
const NETWORK = 'ext:sncb:network';

async function setup({ config = {}, houses = [], devices = [], board } = {}) {
  const state = { board: board ?? liveboard(), disturbances: fixture('disturbances.json') };
  fake = installFetch([
    [/\/stations\?/, () => json(fixture('stations.json'))],
    [/\/liveboard\?/, () => json(state.board)],
    [/\/disturbances\?/, () => json(state.disturbances)],
  ]);
  const gladys = createFakeGladys({ selector: 'sncb', config, houses, devices });
  const timers = createFakeTimers();
  const clock = { now: FIXTURE_NOW };
  const app = new SncbApp({
    gladys,
    logger: quiet,
    now: () => clock.now,
    timers,
    sleep: async () => {},
  });
  gladys.onScanRequest(() => app.publishDevices());
  gladys.onDeviceCreated((device) => app.deviceCreated(device));
  gladys.onSceneAction(SCENE_ACTIONS.NEXT_DEPARTURES, (f) => app.getNextDepartures(f));
  gladys.onSceneAction(SCENE_ACTIONS.DISTURBANCES, () => app.getDisturbances());
  for (const key of Object.values(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => app.getWidget(key, request));
  }
  gladys.onAction(ACTIONS.TEST, () => app.testConnection());
  gladys.onAction(ACTIONS.SEARCH, (fields) => app.searchStations(fields));
  // Resynchronizes gladys.devices from the fake host API.
  await gladys.connect();
  return { app, gladys, timers, clock, state };
}

/** A station device as Gladys hands it back once created. */
function createdStation(filters = '') {
  return {
    external_id: NAMUR,
    name: 'SNCB Namur',
    params: [
      { name: 'station_id', value: 'BE.NMBS.008863008' },
      { name: 'station_name', value: 'Namur' },
      { name: 'filters', value: filters },
      { name: 'max_departures', value: '3' },
    ],
  };
}

test('discovery offers the typed stations, the nearest ones and the network', async () => {
  const { app, gladys } = await setup({
    config: { stations: 'Bruxelles-Central@Namur:Train du retour, Nowhere' },
    houses: [{ id: 1, name: 'Home', selector: 'home', latitude: 50.46, longitude: 4.87 }],
  });
  await app.start({
    stations: 'Bruxelles-Central@Namur:Train du retour, Nowhere',
    nearby_stations: 2,
  });
  const devices = gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.name),
    ['Train du retour', 'SNCB Namur', 'SNCB Dinant', 'SNCB network'],
  );
  const brussels = devices[0];
  assert.equal(brussels.external_id, 'ext:sncb:station:BE.NMBS.008813003');
  assert.equal(brussels.params.find((p) => p.name === 'filters').value, 'namur');
  assert.equal(brussels.features.length, 3 + 3 * 3);
  assert.ok(devices[1].params.some((p) => p.name === 'distance_km'));
  // No device created yet: the status says what to do, no liveboard was read.
  assert.match(gladys.fake.connectionStatus.message.fr, /Aucune gare/);
  assert.ok(!fake.calls.some((c) => /liveboard/.test(c.url)));
});

test('a created station is read, its states published, then refreshed on the timer', async () => {
  const { app, gladys, timers, state, clock } = await setup({
    devices: [createdStation(), { external_id: NETWORK, name: 'SNCB network' }],
  });
  await app.start({});
  assert.equal(gladys.fake.lastState(`${NAMUR}:next_minutes`), 1);
  assert.equal(gladys.fake.lastState(`${NAMUR}:dep1_text`), 'L 5765 → Ciney · voie 8');
  assert.equal(gladys.fake.lastState(`${NAMUR}:dep2_minutes`), 3);
  assert.equal(gladys.fake.lastState(`${NAMUR}:delayed_count`), 0);
  assert.equal(gladys.fake.lastState(`${NETWORK}:disturbances`), 3);
  assert.equal(gladys.fake.lastState(`${NETWORK}:planned_works`), 3);
  assert.match(gladys.fake.connectionStatus.message.en, /Watching 1 station/);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'nothing on the first reading');
  assert.equal(timers.intervals()[0].ms, 60_000);
  // One minute later: the first train crosses the "1 minute" mark... it is
  // already at 1; move 2 minutes so the second train (2 min) reaches 0.
  clock.now = FIXTURE_NOW + 2 * 60_000;
  state.board = liveboard({
    edit: (d) => {
      if (d.station === 'Dinant') d.delay = '600';
    },
  });
  await timers.runIntervals();
  const keys = gladys.fake.sceneEvents.map((e) => e.key);
  assert.ok(keys.includes(SCENE_TRIGGERS.APPROACHING));
  const delayed = gladys.fake.sceneEvents.find((e) => e.key === SCENE_TRIGGERS.DISRUPTED);
  assert.equal(delayed.data.event, 'delayed');
  assert.equal(delayed.data.min_delay, '5');
  assert.equal(delayed.data.destination, 'Dinant');
  assert.equal(delayed.data.delay, 10);
  // The disturbances are not re-read before 5 minutes.
  assert.equal(fake.calls.filter((c) => /disturbances/.test(c.url)).length, 1);
  app.stop();
});

test('a new disturbance fires disturbance_published', async () => {
  const { app, gladys, timers, state, clock } = await setup({
    devices: [{ external_id: NETWORK, name: 'SNCB network' }],
  });
  await app.start({});
  const more = fixture('disturbances.json');
  more.disturbance.unshift({
    id: '99',
    title: 'Namur - Ciney : Retards',
    description: 'Test',
    type: 'disturbance',
    link: 'http://example.org/x',
    timestamp: '1791899999',
  });
  state.disturbances = more;
  clock.now = FIXTURE_NOW + 6 * 60_000;
  await timers.runIntervals();
  assert.equal(gladys.fake.sceneEvents.length, 1);
  assert.equal(gladys.fake.sceneEvents[0].key, SCENE_TRIGGERS.DISTURBANCE);
  assert.equal(gladys.fake.sceneEvents[0].data.title, 'Namur - Ciney : Retards');
  assert.equal(gladys.fake.sceneEvents[0].data.link, 'https://example.org/x');
  assert.equal(gladys.fake.lastState(`${NETWORK}:latest`), 'Namur - Ciney : Retards');
});

test('scene actions and widgets', async () => {
  const { app, gladys } = await setup({
    devices: [createdStation('dinant|liège'), { external_id: NETWORK, name: 'SNCB network' }],
  });
  await app.start({});
  const next = await gladys.fake.sceneAction(SCENE_ACTIONS.NEXT_DEPARTURES, { device: NAMUR });
  assert.equal(next.success, true);
  assert.equal(next.data.outputs.next_destination, 'Liège-Guillemins');
  assert.equal(next.data.outputs.count, 2);
  assert.match(next.data.outputs.list, /IC 2514 → Dinant/);
  const dist = await gladys.fake.sceneAction(SCENE_ACTIONS.DISTURBANCES, {});
  assert.equal(dist.data.outputs.count, 3);
  assert.match(dist.data.outputs.titles, /Retards/);
  const widget = (
    await gladys.fake.widgetGet(WIDGETS.DEPARTURES, { settings: { device: NAMUR }, language: 'fr' })
  ).data.content;
  assert.equal(widget.components[0].text, 'SNCB Namur');
  const status = widget.components.find((c) => c.type === 'status');
  assert.equal(status.items.length, 2);
  assert.match(status.items[0].value, /dans 3 min · voie 4/);
  const list = (await gladys.fake.widgetGet(WIDGETS.DISTURBANCES, { language: 'fr' })).data.content;
  const cards = list.components.find((c) => c.type === 'card-list');
  assert.equal(cards.items.length, 6);
  assert.equal(cards.items[0].badge.text, 'En cours');
  const none = (await gladys.fake.widgetGet(WIDGETS.DEPARTURES, { settings: {} })).data.content;
  assert.match(none.components[0].text.fr, /Choisissez une gare/);
  const wrong = await gladys.fake.sceneAction(SCENE_ACTIONS.NEXT_DEPARTURES, { device: NETWORK });
  assert.equal(wrong.success, false);
});

test('the buttons', async () => {
  const { app, gladys } = await setup({ config: { stations: 'Namur, Atlantis' } });
  await app.start({ stations: 'Namur, Atlantis' });
  const test = await gladys.fake.action(ACTIONS.TEST);
  assert.match(test.data.message.fr, /10 gares connues/);
  assert.match(test.data.message.fr, /Gare inconnue « Atlantis »/);
  const search = await gladys.fake.action(ACTIONS.SEARCH, { query: 'brux' });
  assert.match(search.data.message.en, /Bruxelles-Central \(BE\.NMBS\.008813003\)/);
  assert.match(
    (await gladys.fake.action(ACTIONS.SEARCH, { query: 'zzz' })).data.message.en,
    /Unknown station/,
  );
});

test('iRail down: the status says so and the loop keeps running', async () => {
  const { app, gladys, timers } = await setup({ devices: [createdStation()] });
  fake.restore();
  fake = installFetch([[/./, () => json({ message: 'boom' }, 500)]]);
  await app.start({});
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /unreachable/);
  assert.equal(timers.intervals().length, 1);
});
