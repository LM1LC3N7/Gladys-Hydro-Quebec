import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeConfig } from '../src/config.js';

test('normalizeConfig: falls back to the default when poll_frequency is an empty string', () => {
  // What triggered the "invalid poll frequency" bug in production: an
  // untouched optional number field on the Configuration screen can come
  // back as '' rather than null/undefined. `'' ?? 3600` is '' (not caught
  // by nullish coalescing), and `Number('')` is 0, not NaN - a config with
  // poll_frequency: 0 was silently built and rejected by Gladys.
  const config = normalizeConfig({ username: 'a', password: 'b', poll_frequency: '' });
  assert.equal(config.poll_frequency, 3600);
});

test('normalizeConfig: falls back when poll_frequency is out of the manifest bounds', () => {
  assert.equal(normalizeConfig({ poll_frequency: 0 }).poll_frequency, 3600);
  assert.equal(normalizeConfig({ poll_frequency: -10 }).poll_frequency, 3600);
  assert.equal(normalizeConfig({ poll_frequency: 999999999 }).poll_frequency, 3600);
  assert.equal(normalizeConfig({ poll_frequency: 'not-a-number' }).poll_frequency, 3600);
});

test('normalizeConfig: keeps a valid poll_frequency, including as a numeric string', () => {
  assert.equal(normalizeConfig({ poll_frequency: 1800 }).poll_frequency, 1800);
  assert.equal(normalizeConfig({ poll_frequency: '1800' }).poll_frequency, 1800);
});

test('normalizeConfig: same out-of-bounds guard applies to preheat_duration_minutes', () => {
  assert.equal(normalizeConfig({ preheat_duration_minutes: -5 }).preheat_duration_minutes, 180);
  assert.equal(normalizeConfig({ preheat_duration_minutes: 999 }).preheat_duration_minutes, 180);
  assert.equal(normalizeConfig({ preheat_duration_minutes: 90 }).preheat_duration_minutes, 90);
  // Its min bound is 0, so unlike poll_frequency, an untouched/empty field
  // (Number('') === 0) lands on a legitimate in-range value, not a bug:
  // "no pre-heat lead time" is a valid setting, not something Gladys rejects.
  assert.equal(normalizeConfig({ preheat_duration_minutes: '' }).preheat_duration_minutes, 0);
  assert.equal(normalizeConfig({ preheat_duration_minutes: 0 }).preheat_duration_minutes, 0);
});

test('normalizeConfig: defaults everything when called with no config at all', () => {
  const config = normalizeConfig();
  assert.equal(config.poll_frequency, 3600);
  assert.equal(config.preheat_duration_minutes, 180);
  assert.equal(config.username, '');
  assert.equal(config.password, '');
});
