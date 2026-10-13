// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys and a fake IFTTT.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { IftttApp } from '../src/app.js';
import { ACTIONS, SCENE_ACTIONS, SCENE_TRIGGERS, WEBHOOKS, WIDGETS } from '../src/constants.js';
import { installFetch, text } from './helpers/fakeFetch.js';

const quiet = { info() {}, warn() {}, error() {}, debug() {} };

let fake;
afterEach(() => fake?.restore());

const INBOUND_URL = 'https://plus.example/webhook/abc';

function setup({ config = { webhooks_key: 'k3y' }, webhooks } = {}) {
  fake = installFetch(() => text("Congratulations! You've fired the event"));
  const gladys = createFakeGladys({
    selector: 'ifttt',
    config,
    webhooks: webhooks ?? { available: false, webhooks: [] },
  });
  const app = new IftttApp({ gladys, logger: quiet });
  // What index.js wires.
  gladys.onSceneAction(SCENE_ACTIONS.TRIGGER, (fields) => app.triggerEvent(fields));
  gladys.onSceneAction(SCENE_ACTIONS.TRIGGER_JSON, (fields) => app.triggerEventJson(fields));
  gladys.onWebhook(WEBHOOKS.INBOUND, (request) => app.handleInbound(request));
  gladys.onWebhookUpdated(async (info) => {
    await app.refreshWebhooks(info);
    await app.reportStatus();
  });
  gladys.onWidgetGet(WIDGETS.BUTTON, (request) => app.getWidget(request));
  gladys.onWidgetAction(WIDGETS.BUTTON, (key, params, ctx) => app.widgetAction(key, params, ctx));
  gladys.onAction(ACTIONS.TEST, (fields) => app.testConnection(fields));
  return { app, gladys };
}

test('start reports the status: no key, then ready', async () => {
  const { app, gladys } = setup({ config: {} });
  await app.start({});
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Aucune clé/);
  await app.start({ webhooks_key: ' k3y ' });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /need Gladys Plus/);
  await gladys.fake.webhookUpdated({
    available: true,
    webhooks: [{ key: 'inbound', mode: 'fire_and_forget', url: INBOUND_URL }],
  });
  assert.match(gladys.fake.connectionStatus.message.en, /relayed by Gladys Plus/);
});

test('the scene actions trigger IFTTT and return the outputs', async () => {
  const { app, gladys } = setup();
  await app.start({ webhooks_key: 'k3y' });
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.TRIGGER, {
    event: 'door_open',
    value1: 'front',
  });
  assert.equal(ack.success, true);
  assert.equal(ack.data.outputs.event, 'door_open');
  assert.match(ack.data.outputs.answer, /fired/);
  assert.equal(fake.calls[0].url, 'https://maker.ifttt.com/trigger/door_open/with/key/k3y');
  const json = await gladys.fake.sceneAction(SCENE_ACTIONS.TRIGGER_JSON, {
    event: 'temp',
    payload: '{"temperature": "21.5"}',
  });
  assert.equal(json.success, true);
  assert.deepEqual(fake.calls[1].body, { temperature: '21.5' });
  const bad = await gladys.fake.sceneAction(SCENE_ACTIONS.TRIGGER, { event: 'no way' });
  assert.equal(bad.success, false);
  assert.equal(fake.calls.length, 2);
});

test('an inbound request becomes the event_received scene event', async () => {
  const { app, gladys } = setup();
  await app.start({ webhooks_key: 'k3y', inbound_secret: 's3cret' });
  await gladys.fake.webhook(WEBHOOKS.INBOUND, {
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify({ event: 'leaving_home', value1: 'Alice', secret: 's3cret' }),
    query: {},
  });
  assert.equal(gladys.fake.sceneEvents.length, 1);
  assert.equal(gladys.fake.sceneEvents[0].key, SCENE_TRIGGERS.RECEIVED);
  assert.deepEqual(gladys.fake.sceneEvents[0].data, {
    event: 'leaving_home',
    value1: 'Alice',
    value2: null,
    value3: null,
    payload: null,
  });
  // Wrong secret: ignored, nothing published.
  await gladys.fake.webhook(WEBHOOKS.INBOUND, {
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify({ event: 'leaving_home', secret: 'nope' }),
    query: {},
  });
  assert.equal(gladys.fake.sceneEvents.length, 1);
});

test('the widget shows a button that triggers the configured event', async () => {
  const { app, gladys } = setup();
  await app.start({ webhooks_key: 'k3y' });
  const settings = { event: 'coffee', label: 'Coffee', value1: 'double' };
  const content = (await gladys.fake.widgetGet(WIDGETS.BUTTON, { settings })).data.content;
  assert.equal(content.components[0].text, 'Coffee');
  const button = content.components.find((c) => c.type === 'button');
  assert.equal(button.action.key, 'trigger');
  const ack = await gladys.fake.widgetAction(WIDGETS.BUTTON, 'trigger', {}, { settings });
  assert.match(ack.data.message.en, /"coffee" sent/);
  assert.deepEqual(fake.calls[0].body, { value1: 'double' });
  const none = await gladys.fake.widgetAction(WIDGETS.BUTTON, 'trigger', {}, { settings: {} });
  assert.match(none.data.message.en, /Set the event name/);
});

test('the test button sends gladys_test and tells about the inbound URL', async () => {
  const { app, gladys } = setup({
    webhooks: {
      available: true,
      webhooks: [{ key: 'inbound', mode: 'fire_and_forget', url: INBOUND_URL }],
    },
  });
  await app.start({ webhooks_key: 'k3y' });
  const ack = await gladys.fake.action(ACTIONS.TEST, { event: 'gladys_test' });
  assert.match(ack.data.message.en, /accepted the event "gladys_test"/);
  assert.match(ack.data.message.en, new RegExp(INBOUND_URL));
  assert.deepEqual(fake.calls[0].body, { value1: 'Gladys', value2: 'test' });
  fake.restore();
  fake = installFetch(() => text('Unauthorized', 401));
  const failed = await gladys.fake.action(ACTIONS.TEST, {});
  assert.match(failed.data.message.fr, /refusé le test \(bad_key\)/);
});
