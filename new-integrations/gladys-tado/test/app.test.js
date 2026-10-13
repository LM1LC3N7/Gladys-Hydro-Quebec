// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys and a fake tado.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { TadoApp, configFingerprint } from '../src/app.js';
import {
  ACTIONS,
  CONFIG_KEYS,
  SCENE_ACTIONS,
  SCENE_TRIGGERS,
  TOKEN_KEYS,
  WIDGETS,
} from '../src/constants.js';
import { installFetch, json } from './helpers/fakeFetch.js';
import { createFakeTimers } from './helpers/fakeTimers.js';
import * as v2 from './fixtures/v2.js';
import * as x from './fixtures/x.js';

const quiet = {
  info() {},
  warn: (...a) => process.env.DEBUG_TEST && console.error(...a),
  error() {},
  debug() {},
};

let fake;
afterEach(() => fake?.restore());

const NOW = Date.parse('2026-10-13T12:00:00Z');
const HOME = 'ext:tado:home:1234';
const SALON = 'ext:tado:zone:1234:1';
const WATER = 'ext:tado:zone:1234:3';

/** The classic home 1234, with overridable zone states and presence. */
function v2Routes(state = {}) {
  state.zones ??= v2.zoneStates();
  state.presence ??= v2.homeState();
  return [
    ['POST', /oauth2\/token/, () => json(v2.tokens)],
    ['GET', /\/api\/v2\/me$/, () => json(v2.me)],
    ['GET', /\/homes\/1234$/, () => json(v2.home)],
    ['GET', /\/homes\/1234\/zones$/, () => json(v2.zones)],
    [
      'GET',
      /\/zones\/3\/capabilities$/,
      () => json({ type: 'HOT_WATER', canSetTemperature: false }),
    ],
    ['GET', /\/homes\/1234\/zoneStates$/, () => json(state.zones)],
    ['GET', /\/homes\/1234\/state$/, () => json(state.presence)],
    ['GET', /\/homes\/1234\/weather$/, () => json(v2.weather)],
    ['GET', /\/homes\/1234\/mobileDevices$/, () => json(v2.mobileDevices)],
    ['PUT', /\/zones\/\d+\/overlay$/, (call) => json({ ...call.body, type: 'MANUAL' })],
    ['DELETE', /\/zones\/\d+\/overlay$/, () => json(undefined, 204)],
    ['PUT', /\/presenceLock$/, () => json(undefined, 204)],
    ['DELETE', /\/presenceLock$/, () => json(undefined, 204)],
  ];
}

function setup({ config = { [TOKEN_KEYS.REFRESH]: 'ref0' }, routes, state = {} } = {}) {
  fake = installFetch(routes ?? v2Routes(state));
  const gladys = createFakeGladys({ selector: 'tado', config });
  const timers = createFakeTimers();
  const clock = { now: NOW };
  const app = new TadoApp({ gladys, logger: quiet, now: () => clock.now, timers });
  // What index.js wires.
  gladys.onScanRequest(async () => {
    await app.discover();
    await app.refresh();
  });
  gladys.onSetValue((device, feature, value) => app.setValue(device, feature, value));
  gladys.onOAuthAuthorizeUrl((key) => app.authorizeUrl(key));
  gladys.onSceneAction(SCENE_ACTIONS.SET_TEMPERATURE, (f) => app.setTemperature(f));
  gladys.onSceneAction(SCENE_ACTIONS.RESUME_SCHEDULE, (f) => app.resumeSchedule(f));
  gladys.onSceneAction(SCENE_ACTIONS.SET_PRESENCE, (f) => app.setPresence(f));
  gladys.onSceneAction(SCENE_ACTIONS.GET_ZONE, (f) => app.getZone(f));
  for (const key of Object.values(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => app.getWidget(key, request));
    gladys.onWidgetAction(key, (a, p, c) => app.widgetAction(key, a, p, c));
  }
  gladys.onAction(ACTIONS.TEST, () => app.testConnection());
  gladys.onAction(ACTIONS.UNLINK, () => app.unlink());
  gladys.onConfigUpdated((c) => app.configUpdated(c));
  return { app, gladys, timers, clock, state };
}

const feature = (device, key) => ({ external_id: `${device}:${key}` });

test('not linked: the status says so and nothing is read', async () => {
  const { app, gladys } = setup({ config: {} });
  await app.start({});
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Aucun compte tado/);
  assert.equal(fake.calls.length, 0);
});

test('linked: discovers the home and zones, publishes devices and states, schedules the refresh', async () => {
  const { app, gladys, timers } = setup();
  await app.start({ [TOKEN_KEYS.REFRESH]: 'ref0' });
  // The refresh token was rotated and persisted off-schema.
  assert.equal(gladys.fake.config[TOKEN_KEYS.REFRESH], 'ref1');
  const devices = gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.external_id),
    [HOME, SALON, 'ext:tado:zone:1234:2', WATER],
  );
  const salon = devices.find((d) => d.external_id === SALON);
  assert.equal(salon.name, 'tado° Salon');
  assert.deepEqual(
    salon.features.map((f) => f.external_id.split(':').at(-1)),
    [
      'target_temperature',
      'mode',
      'operating_state',
      'heating_power',
      'temperature',
      'humidity',
      'open_window',
      'low_battery',
    ],
  );
  const water = devices.find((d) => d.external_id === WATER);
  assert.deepEqual(
    water.features.map((f) => f.external_id.split(':').at(-1)),
    ['power', 'mode', 'low_battery'],
  );
  assert.equal(gladys.fake.lastState(`${SALON}:target_temperature`), 21.5);
  assert.equal(gladys.fake.lastState(`${SALON}:mode`), 1, 'manual');
  assert.equal(gladys.fake.lastState(`${SALON}:operating_state`), 1, 'heating');
  assert.equal(gladys.fake.lastState(`${SALON}:temperature`), 20.4);
  assert.equal(gladys.fake.lastState(`${SALON}:low_battery`), 1);
  assert.equal(gladys.fake.lastState(`${SALON}:open_window`), 1, 'closed');
  assert.equal(gladys.fake.lastState('ext:tado:zone:1234:2:mode'), 3, 'schedule');
  assert.equal(gladys.fake.lastState(`${WATER}:power`), 0);
  assert.equal(gladys.fake.lastState(`${HOME}:presence`), 1);
  assert.equal(gladys.fake.lastState(`${HOME}:presence_mode`), 'auto');
  assert.equal(gladys.fake.lastState(`${HOME}:outside_temperature`), 12.3);
  assert.equal(gladys.fake.lastState(`${HOME}:weather`), 'CLOUDY_PARTLY');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /1 home, 3 zones/);
  assert.equal(timers.intervals().length, 1);
  assert.equal(timers.intervals()[0].ms, 120_000);
  // No scene event on the first reading.
  assert.equal(gladys.fake.sceneEvents.length, 0);
  app.stop();
  assert.equal(timers.pending.size, 0);
});

test('a refresh fires the scene events of the transitions', async () => {
  const { app, gladys, timers, state } = setup();
  await app.start({ [TOKEN_KEYS.REFRESH]: 'ref0' });
  state.presence = v2.homeState('AWAY', true);
  state.zones = v2.zoneStates({
    1: { openWindowDetected: true, activityDataPoints: { heatingPower: { percentage: 0 } } },
    2: { activityDataPoints: { heatingPower: { percentage: 30 } } },
  });
  await timers.runIntervals();
  const keys = gladys.fake.sceneEvents.map((e) => e.key);
  assert.deepEqual(
    keys.sort(),
    [
      SCENE_TRIGGERS.HEATING_CHANGED,
      SCENE_TRIGGERS.HEATING_CHANGED,
      SCENE_TRIGGERS.OPEN_WINDOW,
      SCENE_TRIGGERS.PRESENCE_CHANGED,
    ].sort(),
  );
  const presence = gladys.fake.sceneEvents.find((e) => e.key === SCENE_TRIGGERS.PRESENCE_CHANGED);
  assert.deepEqual(presence.data, {
    device: HOME,
    presence: 'away',
    previous: 'home',
    locked: true,
  });
  const window = gladys.fake.sceneEvents.find((e) => e.key === SCENE_TRIGGERS.OPEN_WINDOW);
  assert.equal(window.data.device, SALON);
  assert.equal(gladys.fake.lastState(`${SALON}:open_window`), 0, 'open');
  assert.equal(gladys.fake.lastState(`${HOME}:presence_mode`), 'away');
  // A second identical reading fires nothing more.
  await timers.runIntervals();
  assert.equal(gladys.fake.sceneEvents.length, 4);
});

test('commands: setpoint, schedule, off, presence', async () => {
  const { app, gladys } = setup();
  await app.start({ [TOKEN_KEYS.REFRESH]: 'ref0' });
  const salon = gladys.fake.discoveredDevices.find((d) => d.external_id === SALON);
  const home = gladys.fake.discoveredDevices.find((d) => d.external_id === HOME);
  const before = fake.calls.length;
  await gladys.fake.setValue(salon, feature(SALON, 'target_temperature'), 19);
  const overlay = fake.calls.find((c, i) => i >= before && c.method === 'PUT');
  assert.match(overlay.url, /\/zones\/1\/overlay$/);
  assert.deepEqual(overlay.body, {
    setting: { type: 'HEATING', power: 'ON', temperature: { celsius: 19 } },
    termination: { typeSkillBasedApp: 'NEXT_TIME_BLOCK' },
  });
  await gladys.fake.setValue(salon, feature(SALON, 'mode'), 3);
  assert.ok(fake.calls.some((c) => c.method === 'DELETE' && /zones\/1\/overlay/.test(c.url)));
  await gladys.fake.setValue(salon, feature(SALON, 'mode'), 0);
  assert.deepEqual(
    fake.calls.at(-5).body?.setting ?? fake.calls.findLast((c) => c.method === 'PUT').body.setting,
    {
      type: 'HEATING',
      power: 'OFF',
    },
  );
  await gladys.fake.setValue(home, feature(HOME, 'presence_mode'), 'away');
  const lock = fake.calls.findLast((c) => /presenceLock/.test(c.url));
  assert.equal(lock.method, 'PUT');
  assert.deepEqual(lock.body, { homePresence: 'AWAY' });
  await gladys.fake.setValue(home, feature(HOME, 'presence_mode'), 'auto');
  assert.equal(fake.calls.findLast((c) => /presenceLock/.test(c.url)).method, 'DELETE');
  const bad = await gladys.fake.setValue(salon, feature(SALON, 'humidity'), 1);
  assert.equal(bad.success, false);
});

test('scene actions', async () => {
  const { app, gladys } = setup();
  await app.start({ [TOKEN_KEYS.REFRESH]: 'ref0' });
  const set = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_TEMPERATURE, {
    device: SALON,
    temperature: 22,
    termination: 'timer',
    minutes: 45,
  });
  assert.equal(set.success, true);
  assert.equal(set.data.outputs.zone, 'Salon');
  const put = fake.calls.findLast((c) => c.method === 'PUT');
  assert.deepEqual(put.body.termination, { typeSkillBasedApp: 'TIMER', durationInSeconds: 2700 });
  const resume = await gladys.fake.sceneAction(SCENE_ACTIONS.RESUME_SCHEDULE, { device: SALON });
  assert.equal(resume.success, true);
  const presence = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_PRESENCE, {
    device: HOME,
    presence: 'home',
  });
  assert.equal(presence.success, true);
  assert.deepEqual(fake.calls.findLast((c) => /presenceLock/.test(c.url)).body, {
    homePresence: 'HOME',
  });
  const read = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_ZONE, { device: SALON });
  assert.equal(read.data.outputs.temperature, 20.4);
  assert.equal(read.data.outputs.heating, true);
  assert.equal(read.data.outputs.mode, 'manual');
  const wrong = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_ZONE, { device: HOME });
  assert.equal(wrong.success, false);
});

test('widgets', async () => {
  const { app, gladys } = setup();
  await app.start({ [TOKEN_KEYS.REFRESH]: 'ref0' });
  const zone = (
    await gladys.fake.widgetGet(WIDGETS.ZONE, { settings: { device: SALON }, language: 'fr' })
  ).data.content;
  assert.equal(zone.components[0].text, 'Salon');
  const tiles = zone.components.filter((c) => c.type === 'value' || c.type === 'gauge');
  assert.equal(tiles.length, 4);
  assert.equal(tiles[0].device_feature, `${SALON}:temperature`);
  const status = zone.components.find((c) => c.type === 'status');
  assert.equal(status.items[0].value, 'Minuterie');
  assert.ok(status.items.some((i) => i.label.fr === 'Batterie faible'));
  const buttons = zone.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => b.action.key),
    ['target', 'target', 'resume', 'off'],
  );
  assert.equal(buttons[1].action.params.target, 22);
  const tap = await gladys.fake.widgetAction(
    WIDGETS.ZONE,
    'target',
    { target: 22 },
    { settings: { device: SALON } },
  );
  assert.match(tap.data.message.en, /Done/);
  assert.equal(fake.calls.findLast((c) => c.method === 'PUT').body.setting.temperature.celsius, 22);
  const home = (await gladys.fake.widgetGet(WIDGETS.HOME, { settings: { device: HOME } })).data
    .content;
  assert.equal(
    home.components.filter((c) => c.type === 'value').length,
    3,
    'outside + 2 heating zones',
  );
  assert.match(home.components.find((c) => c.type === 'status').items[0].value, /Home/);
  const none = (await gladys.fake.widgetGet(WIDGETS.ZONE, { settings: {} })).data.content;
  assert.match(none.components[0].text.en, /Pick a zone/);
});

test('account linking through the device-code flow', async () => {
  let approved = false;
  const routes = v2Routes();
  routes.unshift(
    [
      'POST',
      /device_authorize/,
      () =>
        json({
          device_code: 'dc',
          user_code: 'ABC',
          verification_uri_complete: 'https://login.tado.com/oauth2/device?user_code=ABC',
          interval: 5,
          expires_in: 300,
        }),
    ],
    [
      'POST',
      /oauth2\/token/,
      (call) =>
        call.body.grant_type?.endsWith('device_code') && !approved
          ? json({ error: 'authorization_pending' }, 400)
          : json(v2.tokens),
    ],
  );
  const { app, gladys, timers, clock } = setup({ config: {}, routes });
  await app.start({});
  const ack = await gladys.fake.oauthAuthorizeUrl(CONFIG_KEYS.ACCOUNT);
  assert.equal(ack.success, true);
  assert.match(ack.data.url ?? JSON.stringify(ack.data), /user_code=ABC/);
  assert.match(gladys.fake.connectionStatus.message.en, /Waiting for your approval/);
  assert.equal(timers.timeouts().length, 1);
  await timers.runTimeouts(); // still pending
  assert.equal(gladys.fake.connectionStatus.connected, false);
  approved = true;
  await timers.runTimeouts();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.config[TOKEN_KEYS.REFRESH], 'ref1');
  assert.equal(gladys.fake.discoveredDevices.length, 4);
  // An expired flow stops polling and says so.
  approved = false;
  await gladys.fake.oauthAuthorizeUrl(CONFIG_KEYS.ACCOUNT);
  clock.now = NOW + 400_000;
  await timers.runTimeouts();
  assert.match(gladys.fake.connectionStatus.message.en, /link expired/);
});

test('an expired session stops the refresh and asks to link again', async () => {
  const routes = v2Routes();
  routes.unshift(['POST', /oauth2\/token/, () => json({ error: 'invalid_grant' }, 400)]);
  const { app, gladys, timers } = setup({ routes });
  await app.start({ [TOKEN_KEYS.REFRESH]: 'stale' });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /link the account again/);
  assert.equal(timers.intervals().length, 0);
  const unlink = await gladys.fake.action(ACTIONS.UNLINK);
  assert.match(unlink.data.message.en, /unlinked/);
  assert.equal(gladys.fake.config[TOKEN_KEYS.REFRESH], '');
});

test('a config update that only rotated the token does not restart', async () => {
  const { app, gladys } = setup();
  await app.start({ [TOKEN_KEYS.REFRESH]: 'ref0' });
  const calls = fake.calls.length;
  await gladys.fake.configUpdated({ [TOKEN_KEYS.REFRESH]: 'ref1' });
  assert.equal(fake.calls.length, calls);
  await gladys.fake.configUpdated({ [TOKEN_KEYS.REFRESH]: 'ref1', refresh_interval: 300 });
  assert.ok(fake.calls.length > calls, 'a real change restarts');
  assert.equal(app.config.refreshInterval, 300);
  assert.notEqual(
    configFingerprint({ a: 1, [TOKEN_KEYS.REFRESH]: 'x' }),
    configFingerprint({ a: 2 }),
  );
});

test('a tado X home reads rooms through hops', async () => {
  const routes = [
    ['POST', /oauth2\/token/, () => json(v2.tokens)],
    ['GET', /\/api\/v2\/me$/, () => json({ ...v2.me, homes: [{ id: 5678, name: 'Loft' }] })],
    ['GET', /\/homes\/5678$/, () => json(x.home)],
    ['GET', /hops.*\/homes\/5678\/roomsAndDevices$/, () => json(x.roomsAndDevices)],
    ['GET', /hops.*\/homes\/5678\/rooms$/, () => json(x.rooms())],
    ['GET', /\/homes\/5678\/state$/, () => json(v2.homeState())],
    ['GET', /\/homes\/5678\/weather$/, () => json(v2.weather)],
    ['POST', /rooms\/7\/manualControl$/, () => json(undefined, 204)],
    ['POST', /rooms\/7\/resumeSchedule$/, () => json(undefined, 204)],
  ];
  const { app, gladys } = setup({ routes });
  await app.start({ [TOKEN_KEYS.REFRESH]: 'ref0' });
  const room = 'ext:tado:zone:5678:7';
  assert.equal(gladys.fake.lastState(`${room}:temperature`), 22.1);
  assert.equal(gladys.fake.lastState(`${room}:target_temperature`), 23);
  assert.equal(gladys.fake.lastState(`${room}:mode`), 3);
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === room);
  await gladys.fake.setValue(device, feature(room, 'target_temperature'), 21);
  const post = fake.calls.findLast((c) => /manualControl/.test(c.url));
  assert.deepEqual(post.body, {
    setting: { power: 'ON', temperature: { value: 21 } },
    termination: { type: 'NEXT_TIME_BLOCK' },
  });
  await gladys.fake.setValue(device, feature(room, 'mode'), 3);
  assert.ok(fake.calls.some((c) => /resumeSchedule/.test(c.url)));
});

test('the phones become presence sensors when asked', async () => {
  const { app, gladys } = setup();
  await app.start({ [TOKEN_KEYS.REFRESH]: 'ref0', track_phones: true });
  const phone = 'ext:tado:phone:1234:11';
  assert.ok(gladys.fake.discoveredDevices.some((d) => d.external_id === phone));
  assert.equal(gladys.fake.lastState(`${phone}:at_home`), 1);
});

test('the test button', async () => {
  const { app, gladys } = setup();
  await app.start({ [TOKEN_KEYS.REFRESH]: 'ref0' });
  const ack = await gladys.fake.action(ACTIONS.TEST);
  assert.match(ack.data.message.en, /jane@example.com: Maison/);
});
