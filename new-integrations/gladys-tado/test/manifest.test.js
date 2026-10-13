// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACTIONS,
  CONFIG_KEYS,
  SCENE_ACTIONS,
  SCENE_TRIGGERS,
  TERMINATION,
  WIDGETS,
} from '../src/constants.js';
import { DEFAULTS } from '../src/config.js';

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
  assert.equal(manifest.type, 'device');
  assert.match(manifest.gladys_version, />=5\.1\.0/);
  assert.equal(manifest.docker_image, `ghcr.io/lm1lc3n7/gladys-tado:${manifest.version}`);
  assert.equal(manifest.version, JSON.parse(read('package.json')).version);
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
    assert.ok(read(`docs/${lang}.md`).length >= 300, `docs/${lang}.md is too short for the store`);
  }
  assert.match(manifest.description.en, /Unofficial/);
  assert.match(manifest.description.fr, /non officiel/);
});

test('every text is bilingual', () => {
  for (const [path, text] of texts(manifest)) {
    assert.ok(text.en?.trim() && text.fr?.trim(), `${path} needs en and fr`);
  }
});

test('the configuration matches the code', () => {
  const fields = Object.fromEntries(manifest.config_schema.map((f) => [f.key, f]));
  assert.equal(fields[CONFIG_KEYS.ACCOUNT].type, 'account_link');
  assert.equal(fields.termination.default, DEFAULTS.termination);
  assert.deepEqual(
    fields.termination.options.map((o) => o.value),
    Object.values(TERMINATION),
  );
  assert.equal(fields.timer_minutes.default, DEFAULTS.timer_minutes);
  assert.equal(fields.refresh_interval.default, DEFAULTS.refresh_interval);
  assert.equal(fields.track_phones.default, DEFAULTS.track_phones);
  assert.ok(index.includes('onOAuthAuthorizeUrl'));
});

test('the keys of the manifest are the keys of the code', () => {
  assert.deepEqual(manifest.actions.map((a) => a.key).sort(), Object.values(ACTIONS).sort());
  assert.deepEqual(
    manifest.scene_actions.map((a) => a.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.deepEqual(manifest.widgets.map((w) => w.key).sort(), Object.values(WIDGETS).sort());
  for (const name of Object.keys(SCENE_ACTIONS)) {
    assert.ok(index.includes(`onSceneAction(SCENE_ACTIONS.${name}`), name);
  }
  for (const item of [...manifest.scene_triggers, ...manifest.scene_actions, ...manifest.widgets]) {
    const device = (item.fields ?? item.settings).find((f) => f.key === 'device');
    assert.equal(device?.source, 'devices', `${item.key} picks a device`);
  }
  const termination = manifest.scene_actions
    .find((a) => a.key === 'set_temperature')
    .fields.find((f) => f.key === 'termination');
  assert.deepEqual(
    termination.options.map((o) => o.value),
    Object.values(TERMINATION),
  );
});
