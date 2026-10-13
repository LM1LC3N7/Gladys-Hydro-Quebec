import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildContractDevice } from '../src/devices/contract.js';

const fakeGladys = {
  externalIds: (kind, id) => ({
    device: `ext:svc:${kind}:${id}`,
    feature: (featureKey) => `ext:svc:${kind}:${id}:${featureKey}`,
  }),
};

const baseContract = {
  contractId: '123',
  accountId: 'a1',
  address: '1 rue Test',
  customerNames: ['Test'],
};

// t_device_feature.min and .max are NOT NULL in Gladys's schema for every
// feature category/type (server/models/device_feature.js), even binary and
// text/select ones - it's not checked at publish time (setDiscoveredDevices),
// only when the user actually clicks "add" on the Discovery screen, which is
// what made this ship broken: the device looked fine until someone tried to
// install it, then failed with a 422 "t_device_feature.max cannot be null".
test('buildContractDevice: every feature has both min and max, for a base contract', () => {
  const device = buildContractDevice(fakeGladys, { ...baseContract, rate: 'D', rateOption: null });
  assert.ok(device.features.length > 0);
  for (const feature of device.features) {
    assert.notEqual(feature.min, undefined, `${feature.name}: min must be set`);
    assert.notEqual(feature.max, undefined, `${feature.name}: max must be set`);
    assert.equal(typeof feature.min, 'number');
    assert.equal(typeof feature.max, 'number');
  }
});

test('buildContractDevice: every feature has both min and max, for a CPC (Winter Credit) contract', () => {
  const device = buildContractDevice(fakeGladys, { ...baseContract, rate: 'D', rateOption: 'CPC' });
  for (const feature of device.features) {
    assert.notEqual(feature.min, undefined, `${feature.name}: min must be set`);
    assert.notEqual(feature.max, undefined, `${feature.name}: max must be set`);
  }
});

test('buildContractDevice: every feature has both min and max, for a DPC (Flex D) contract', () => {
  const device = buildContractDevice(fakeGladys, { ...baseContract, rate: 'DPC', rateOption: null });
  for (const feature of device.features) {
    assert.notEqual(feature.min, undefined, `${feature.name}: min must be set`);
    assert.notEqual(feature.max, undefined, `${feature.name}: max must be set`);
  }
});

test('buildContractDevice: never sets device.poll_frequency (Gladys enum is incompatible with hourly polling)', () => {
  const device = buildContractDevice(fakeGladys, { ...baseContract, rate: 'D', rateOption: null });
  assert.equal(device.poll_frequency, undefined);
});

test('buildContractDevice: a 30-minute consumption and no daily one, the average cost per day is an amount', () => {
  const device = buildContractDevice(fakeGladys, { ...baseContract, rate: 'D', rateOption: null });
  const byKey = Object.fromEntries(device.features.map((f) => [f.external_id.split(':').pop(), f]));
  assert.equal(byKey.thirty_minutes_consumption.category, 'energy-sensor');
  assert.equal(byKey.thirty_minutes_consumption.type, 'thirty-minutes-consumption');
  assert.equal(byKey.thirty_minutes_consumption.unit, 'kilowatt-hour');
  assert.equal(byKey.daily_consumption, undefined);
  // Same key as before (its history is kept), no longer an energy cost.
  assert.equal(byKey.daily_consumption_cost.category, 'currency');
  assert.equal(byKey.daily_consumption_cost.type, 'decimal');
  assert.ok(
    !device.features.some((f) => f.type.endsWith('-consumption-cost')),
    'the energy cost is derived by Gladys, never published',
  );
});

test('contractStates: the temperature is filed under the day it measures, the consumption is not a state', async () => {
  const { contractStates } = await import('../src/devices/contract.js');
  const ids = fakeGladys.externalIds('contract', '123');
  const states = contractStates(ids, {
    avg_temperature: -12,
    daily_consumption_at: '2026-01-12T00:00:00-05:00',
    daily_cost_mean: 4.2,
    balance: 120,
    outage_active: false,
  });
  const byFeature = Object.fromEntries(states.map((s) => [s.device_feature_external_id.split(':').pop(), s]));
  assert.equal(byFeature.avg_temperature.created_at, '2026-01-12T00:00:00-05:00');
  assert.equal(byFeature.daily_consumption_cost.state, 4.2);
  assert.equal(byFeature.daily_consumption_cost.created_at, undefined);
  assert.equal(byFeature.thirty_minutes_consumption, undefined);
  assert.equal(byFeature.balance.created_at, undefined, 'live values keep the time of the reading');
  assert.equal(byFeature.power_outage.state, 0);
});

test('peakFeatureStates: a `peaks` reading only pushes the fields it carries', async () => {
  const { peakFeatureStates } = await import('../src/devices/contract.js');
  const ids = fakeGladys.externalIds('contract', '123');
  const states = peakFeatureStates(ids, {
    dpc: { current_state: 'peak', peak_in_progress: true, preheat_in_progress: false },
  });
  assert.deepEqual(
    states.map((s) => s.device_feature_external_id.split(':').pop()),
    ['dpc_state', 'dpc_peak_in_progress', 'dpc_preheat_in_progress'],
  );
});
