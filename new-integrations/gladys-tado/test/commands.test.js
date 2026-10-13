import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeCommand, settingFor, terminationFor, zoneCommand } from '../src/commands.js';
import { DEFAULTS, normalizeConfig } from '../src/config.js';
import { FEATURE } from '../src/devices.js';
import { zoneFromV2, zoneFromX } from '../src/tado/model.js';
import * as v2 from './fixtures/v2.js';
import * as x from './fixtures/x.js';

const config = normalizeConfig({});
const salon = zoneFromV2(v2.zones[0], v2.zoneStates().zoneStates[1]);
const water = zoneFromV2(v2.zones[2], v2.zoneStates().zoneStates[3]);
const studio = zoneFromX(x.rooms()[0]);

test('the defaults match the manifest', () => {
  assert.equal(config.termination, DEFAULTS.termination);
  assert.equal(config.timerMinutes, 60);
  assert.equal(config.refreshInterval, 120);
});

test('terminations per generation', () => {
  assert.deepEqual(terminationFor('v2', { termination: 'next_time_block' }), {
    typeSkillBasedApp: 'NEXT_TIME_BLOCK',
  });
  assert.deepEqual(terminationFor('v2', { termination: 'manual' }), {
    typeSkillBasedApp: 'MANUAL',
  });
  assert.deepEqual(terminationFor('v2', { termination: 'timer', timerMinutes: 30 }), {
    typeSkillBasedApp: 'TIMER',
    durationInSeconds: 1800,
  });
  assert.deepEqual(terminationFor('x', { termination: 'timer', timerMinutes: 10 }), {
    type: 'TIMER',
    durationInSeconds: 600,
  });
  assert.deepEqual(terminationFor('x', { termination: 'manual' }), { type: 'MANUAL' });
});

test('a target temperature is snapped and bounded', () => {
  const cmd = zoneCommand(salon, FEATURE.TARGET, 21.74, config);
  assert.equal(cmd.kind, 'overlay');
  assert.deepEqual(cmd.setting, { type: 'HEATING', power: 'ON', temperature: { celsius: 21.5 } });
  assert.deepEqual(cmd.termination, { typeSkillBasedApp: 'NEXT_TIME_BLOCK' });
  assert.equal(zoneCommand(salon, FEATURE.TARGET, 40, config).setting.temperature.celsius, 25);
  assert.equal(zoneCommand(salon, FEATURE.TARGET, 1, config).setting.temperature.celsius, 5);
  assert.throws(() => zoneCommand(salon, FEATURE.TARGET, 'warm', config), /Not a temperature/);
});

test('the thermostat modes: schedule resumes, off powers off, manual keeps the target', () => {
  assert.deepEqual(zoneCommand(salon, FEATURE.MODE, 3, config), { kind: 'resume' });
  assert.deepEqual(zoneCommand(salon, FEATURE.MODE, 0, config).setting, {
    type: 'HEATING',
    power: 'OFF',
  });
  assert.deepEqual(zoneCommand(salon, FEATURE.MODE, 1, config).setting.temperature, {
    celsius: 21.5,
  });
  // A zone that is off takes the next scheduled temperature, else 20.
  const off = { ...salon, power: false, targetTemperature: null };
  assert.equal(zoneCommand(off, FEATURE.MODE, 1, config).setting.temperature.celsius, 18);
  assert.equal(
    zoneCommand({ ...off, nextChange: null }, FEATURE.MODE, 1, config).setting.temperature.celsius,
    20,
  );
});

test('hot water and tado X settings', () => {
  assert.deepEqual(zoneCommand(water, FEATURE.POWER, 1, config).setting, {
    type: 'HOT_WATER',
    power: 'ON',
  });
  assert.deepEqual(zoneCommand(water, FEATURE.MODE, 1, config), { kind: 'resume' });
  assert.deepEqual(
    zoneCommand({ ...water, canSetTemperature: true }, FEATURE.TARGET, 50.4, config).setting,
    {
      type: 'HOT_WATER',
      power: 'ON',
      temperature: { celsius: 50 },
    },
  );
  assert.deepEqual(zoneCommand(studio, FEATURE.TARGET, 22, config), {
    kind: 'overlay',
    setting: { power: 'ON', temperature: { value: 22 } },
    termination: { type: 'NEXT_TIME_BLOCK' },
  });
  assert.deepEqual(settingFor(studio, { power: false }), { power: 'OFF', temperature: null });
  assert.throws(() => zoneCommand(salon, FEATURE.HUMIDITY, 1, config), /not a command/);
});

test('the home presence select', () => {
  assert.deepEqual(homeCommand(FEATURE.PRESENCE_MODE, 'home'), { kind: 'presence', value: 'HOME' });
  assert.deepEqual(homeCommand(FEATURE.PRESENCE_MODE, 'AWAY'), { kind: 'presence', value: 'AWAY' });
  assert.deepEqual(homeCommand(FEATURE.PRESENCE_MODE, 'auto'), { kind: 'presence', value: null });
  assert.throws(() => homeCommand(FEATURE.PRESENCE_MODE, 'maybe'), /Unknown presence/);
});
