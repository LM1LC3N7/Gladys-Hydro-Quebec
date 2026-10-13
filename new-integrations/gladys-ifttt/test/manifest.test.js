// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTIONS, SCENE_ACTIONS, SCENE_TRIGGERS, WEBHOOKS, WIDGETS } from '../src/constants.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const index = read('index.js');

function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) {
      yield* texts(item, `${path}[${i}]`);
    }
  } else if (node && typeof node === 'object') {
    if ('en' in node || 'fr' in node) {
      yield [path, node];
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      yield* texts(value, `${path}.${key}`);
    }
  }
}

test('the store basics', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'provider');
  assert.match(
    manifest.gladys_version,
    />=5\.1\.0/,
    'provider, widgets and scenes need Gladys 5.1',
  );
  assert.equal(manifest.docker_image, `ghcr.io/lm1lc3n7/gladys-ifttt:${manifest.version}`);
  assert.equal(manifest.version, JSON.parse(read('package.json')).version);
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
  }
  assert.match(manifest.description.en, /Unofficial/);
  assert.match(manifest.description.fr, /non officiel/);
  for (const lang of ['en', 'fr']) {
    assert.ok(read(`docs/${lang}.md`).length >= 300, `docs/${lang}.md is too short for the store`);
  }
});

test('every text is bilingual', () => {
  for (const [path, text] of texts(manifest)) {
    assert.ok(text.en?.trim() && text.fr?.trim(), `${path} needs en and fr`);
  }
});

test('the keys of the manifest are the keys of the code', () => {
  assert.deepEqual(
    manifest.actions.map((a) => a.key),
    Object.values(ACTIONS),
  );
  assert.deepEqual(
    manifest.scene_actions.map((a) => a.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key),
    Object.values(SCENE_TRIGGERS),
  );
  assert.deepEqual(
    manifest.webhooks.map((w) => w.key),
    Object.values(WEBHOOKS),
  );
  assert.deepEqual(
    manifest.widgets.map((w) => w.key),
    Object.values(WIDGETS),
  );
  for (const name of ['TRIGGER', 'TRIGGER_JSON']) {
    assert.ok(index.includes(`onSceneAction(SCENE_ACTIONS.${name}`));
  }
  assert.ok(index.includes('onWebhook(WEBHOOKS.INBOUND'));
  assert.ok(index.includes('onWidgetGet(WIDGETS.BUTTON'));
  assert.ok(index.includes('onAction(ACTIONS.TEST'));
  const fields = Object.fromEntries(manifest.config_schema.map((f) => [f.key, f]));
  assert.equal(fields.webhooks_key.type, 'secret');
  assert.equal(fields.inbound_secret.type, 'secret');
  // The trigger's variables are exactly what handleInbound publishes.
  assert.deepEqual(
    manifest.scene_triggers[0].variables.map((v) => v.key),
    ['event', 'value1', 'value2', 'value3', 'payload'],
  );
});
