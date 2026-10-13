// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys and a fake Livebox.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { LiveboxApp } from '../src/app.js';
import { ACTIONS, SCENE_ACTIONS, SCENE_TRIGGERS, WIDGETS } from '../src/constants.js';
import { LiveboxClient } from '../src/livebox/client.js';
import { installLivebox } from './helpers/fakeFetch.js';
import { createFakeTimers } from './helpers/fakeTimers.js';
import * as fx from './fixtures/livebox.js';

const quiet = {
  info() {},
  warn: (...a) => process.env.DEBUG_TEST && console.error(...a),
  error() {},
  debug() {},
};

let fake;
afterEach(() => fake?.restore());

const BOX = 'ext:livebox:box';
const PHONE = 'ext:livebox:host:aabbccddee01';

function routes(state) {
  return {
    'Devices.get': () => ({ status: fx.devices(state.devices) }),
    'NMC.getWANStatus': () => ({ data: fx.wanStatus(state.wan) }),
    'NMC.Wifi.get': () => ({ status: fx.wifi(state.wifi) }),
    'NMC.Wifi.set': (p) => {
      state.wifi = { enable: p.Enable };
      return { status: true };
    },
    'NMC.Guest.get': () => ({ status: fx.guest(state.guest) }),
    'NMC.Guest.set': (p) => {
      state.guest = { enable: p.Enable };
      return { status: true };
    },
    'VoiceService.VoiceApplication.getCallList': () => ({ status: fx.calls(state.calls) }),
    'DeviceInfo.get': () => ({ status: fx.deviceInfo }),
    'NeMo.Intf.data.getMIBs': () => ({ status: { dsl: { dsl0: fx.dsl } } }),
    'NMC.reboot': () => {
      state.rebooted = true;
      return { status: true };
    },
  };
}

async function setup({ config = { password: 'secret' }, devices = [], liveboxOptions = {} } = {}) {
  const state = { devices: {}, wan: {}, wifi: {}, guest: {}, calls: {} };
  fake = installLivebox(routes(state), liveboxOptions);
  const gladys = createFakeGladys({ selector: 'livebox', config, devices });
  const timers = createFakeTimers();
  const clock = { now: fx.NOW };
  const app = new LiveboxApp({
    gladys,
    logger: quiet,
    now: () => clock.now,
    timers,
    clientFactory: (c) => new LiveboxClient(c),
  });
  gladys.onScanRequest(() => app.publishDevices());
  gladys.onSetValue((d, f, v) => app.setValue(d, f, v));
  gladys.onSceneAction(SCENE_ACTIONS.DEVICES, () => app.getDevices());
  gladys.onSceneAction(SCENE_ACTIONS.WIFI, (f) => app.setWifi(f));
  gladys.onSceneAction(SCENE_ACTIONS.REBOOT, () => app.reboot());
  for (const key of Object.values(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => app.getWidget(key, request));
  }
  gladys.onAction(ACTIONS.TEST, () => app.testConnection());
  gladys.onAction(ACTIONS.REBOOT, () => app.rebootAction());
  await gladys.connect();
  return { app, gladys, timers, clock, state };
}

const phoneDevice = {
  external_id: PHONE,
  name: 'Phone Jane',
  params: [{ name: 'mac', value: 'AA:BB:CC:DD:EE:01' }],
};

test('no password: the status says so', async () => {
  const { app, gladys } = await setup({ config: {} });
  await app.start({});
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Aucun mot de passe/);
  assert.equal(fake.calls.length, 0);
});

test('start logs in, reads the box, publishes the devices and the states', async () => {
  const { app, gladys, timers } = await setup();
  await app.start({ password: 'secret' });
  assert.equal(fake.contexts, 1);
  assert.equal(fake.calls[0].method, 'GET', 'the home page first (cookies)');
  assert.equal(fake.calls[1].headers.Authorization, 'X-Sah-Login');
  assert.match(fake.calls[2].headers.Cookie, /sessid=abc/);
  assert.equal(fake.calls[2].headers['X-Context'], 'ctx1');
  const devices = gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.name),
    ['Livebox (Livebox 5)', 'Phone Jane', 'Laptop'],
    'wired devices not offered by default',
  );
  assert.ok(
    devices[0].features.some((f) => f.external_id.endsWith(':download_rate')),
    'a DSL box has the line rates',
  );
  assert.equal(gladys.fake.lastState(`${BOX}:internet`), 1);
  assert.equal(gladys.fake.lastState(`${BOX}:link_type`), 'dsl');
  assert.equal(gladys.fake.lastState(`${BOX}:wifi`), 1);
  assert.equal(gladys.fake.lastState(`${BOX}:guest_wifi`), 0);
  assert.equal(gladys.fake.lastState(`${BOX}:devices_online`), 3);
  assert.equal(gladys.fake.lastState(`${BOX}:missed_calls`), 1);
  assert.equal(gladys.fake.lastState(`${BOX}:download_rate`), 52.3);
  assert.equal(gladys.fake.lastState(`${BOX}:uptime`), 77);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /Livebox 5: internet up, 3 devices online, 0 tracked/,
  );
  assert.equal(timers.intervals()[0].ms, 30_000);
  assert.equal(gladys.fake.sceneEvents.length, 0);
  app.stop();
});

test('a tracked phone leaves and comes back, a missed call arrives, internet drops', async () => {
  const { app, gladys, timers, state } = await setup({ devices: [phoneDevice] });
  await app.start({ password: 'secret' });
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1);
  state.devices = { phoneActive: false };
  state.calls = {
    extra: [
      {
        callId: '14',
        remoteNumber: '0699887766',
        callType: 'missed',
        startTime: '2026-10-13T11:30:00Z',
      },
    ],
  };
  state.wan = { connected: false };
  await timers.runIntervals();
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 0);
  assert.equal(gladys.fake.lastState(`${BOX}:internet`), 0);
  const keys = gladys.fake.sceneEvents.map((e) => e.key).sort();
  assert.deepEqual(keys, [
    SCENE_TRIGGERS.DISCONNECTED,
    SCENE_TRIGGERS.INTERNET,
    SCENE_TRIGGERS.MISSED_CALL,
  ]);
  const gone = gladys.fake.sceneEvents.find((e) => e.key === SCENE_TRIGGERS.DISCONNECTED);
  assert.equal(gone.data.device, PHONE);
  assert.equal(gone.data.name, 'Phone Jane');
  assert.equal(
    gladys.fake.sceneEvents.find((e) => e.key === SCENE_TRIGGERS.MISSED_CALL).data.number,
    '0699887766',
  );
  assert.equal(
    gladys.fake.sceneEvents.find((e) => e.key === SCENE_TRIGGERS.INTERNET).data.state,
    'down',
  );
  state.devices = {};
  state.wan = {};
  await timers.runIntervals();
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.CONNECTED).length, 1);
  assert.equal(
    gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.MISSED_CALL).length,
    1,
    'a call is announced once',
  );
  assert.match(gladys.fake.connectionStatus.message.fr, /1 suivi/);
});

test('the Wi-Fi switches and the scene actions', async () => {
  const { app, gladys, state } = await setup();
  await app.start({ password: 'secret' });
  const box = gladys.fake.discoveredDevices[0];
  await gladys.fake.setValue(box, { external_id: `${BOX}:wifi` }, 0);
  assert.deepEqual(state.wifi, { enable: false });
  assert.equal(gladys.fake.lastState(`${BOX}:wifi`), 0);
  await gladys.fake.setValue(box, { external_id: `${BOX}:guest_wifi` }, 1);
  assert.deepEqual(state.guest, { enable: true });
  const bad = await gladys.fake.setValue(box, { external_id: `${BOX}:internet` }, 1);
  assert.equal(bad.success, false);
  const list = await gladys.fake.sceneAction(SCENE_ACTIONS.DEVICES, {});
  assert.equal(list.data.outputs.online, 3);
  assert.equal(list.data.outputs.names, 'Laptop, NAS, Phone Jane');
  const wifi = await gladys.fake.sceneAction(SCENE_ACTIONS.WIFI, { network: 'main', state: 'on' });
  assert.equal(wifi.data.outputs.enabled, true);
  assert.deepEqual(state.wifi, { enable: true });
  const reboot = await gladys.fake.sceneAction(SCENE_ACTIONS.REBOOT, {});
  assert.equal(reboot.data.outputs.requested, true);
  assert.equal(state.rebooted, true);
});

test('widgets', async () => {
  const { app, gladys } = await setup();
  await app.start({ password: 'secret' });
  const network = (await gladys.fake.widgetGet(WIDGETS.NETWORK, { language: 'fr' })).data.content;
  const status = network.components.find((c) => c.type === 'status');
  assert.equal(status.items[0].value, 'Connecté');
  assert.ok(status.items.some((i) => /52.3/.test(i.value)));
  const buttons = network.components.filter((c) => c.type === 'button');
  assert.equal(buttons[0].device_feature, `${BOX}:wifi`);
  assert.equal(buttons[0].value, 0, 'Wi-Fi is on: the button turns it off');
  const devices = (await gladys.fake.widgetGet(WIDGETS.DEVICES, { language: 'en' })).data.content;
  assert.equal(devices.components.find((c) => c.type === 'status').items.length, 3);
});

test('an expired context is renewed once, a wrong password stops everything', async () => {
  const { app, gladys, timers } = await setup({ liveboxOptions: { contextLife: 3 } });
  await app.start({ password: 'secret' });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.ok(fake.contexts >= 2, 'the context was renewed during the first refresh');
  await timers.runIntervals();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  app.stop();
  fake.restore();
  const wrong = await setup({ liveboxOptions: { password: 'other' } });
  await wrong.app.start({ password: 'secret' });
  assert.equal(wrong.gladys.fake.connectionStatus.connected, false);
  assert.match(wrong.gladys.fake.connectionStatus.message.en, /refused the login/);
  assert.equal(wrong.timers.intervals().length, 0);
  const test = await wrong.gladys.fake.action(ACTIONS.TEST);
  assert.match(test.data.message.fr, /a refusé la connexion/);
});

test('the buttons', async () => {
  const { app, gladys, state } = await setup();
  await app.start({ password: 'secret' });
  const test = await gladys.fake.action(ACTIONS.TEST);
  assert.match(
    test.data.message.en,
    /Livebox 5 \(firmware SR50.*\) answers at 192.168.1.1: internet connected, IP 82.1.2.3/,
  );
  const reboot = await gladys.fake.action(ACTIONS.REBOOT);
  assert.match(reboot.data.message.fr, /redémarre/);
  assert.equal(state.rebooted, true);
});
