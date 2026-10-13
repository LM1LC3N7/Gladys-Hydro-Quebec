import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isActive,
  phonesFromDevices,
  presenceFromState,
  weatherFromState,
  zoneFromV2,
  zoneFromX,
} from '../src/tado/model.js';
import * as v2 from './fixtures/v2.js';
import * as x from './fixtures/x.js';

test('a v2 heating zone with a timer overlay', () => {
  const zone = zoneFromV2(v2.zones[0], v2.zoneStates().zoneStates[1]);
  assert.equal(zone.id, '1');
  assert.equal(zone.name, 'Salon');
  assert.equal(zone.type, 'HEATING');
  assert.equal(zone.generation, 'v2');
  assert.equal(zone.power, true);
  assert.equal(zone.targetTemperature, 21.5);
  assert.equal(zone.temperature, 20.4);
  assert.equal(zone.humidity, 55.3);
  assert.equal(zone.heatingPower, 42);
  assert.deepEqual(zone.overlay, { type: 'TIMER', expiresAt: '2026-10-13T15:00:00Z' });
  assert.equal(zone.openWindow, false);
  assert.equal(zone.online, true);
  assert.deepEqual(zone.nextChange, { start: '2026-10-13T21:00:00Z', targetTemperature: 18 });
  assert.equal(zone.lowBattery, true, 'one valve is LOW');
  assert.equal(isActive(zone), true);
});

test('a v2 zone on schedule, and a hot water zone without temperature control', () => {
  const bedroom = zoneFromV2(v2.zones[1], v2.zoneStates().zoneStates[2]);
  assert.equal(bedroom.overlay, null);
  assert.equal(bedroom.heatingPower, 0);
  assert.equal(isActive(bedroom), false);
  assert.equal(bedroom.lowBattery, false);
  const water = zoneFromV2(v2.zones[2], v2.zoneStates().zoneStates[3]);
  assert.equal(water.type, 'HOT_WATER');
  assert.equal(water.power, false);
  assert.equal(water.targetTemperature, null);
  assert.equal(water.canSetTemperature, false, 'setting.temperature is null: on/off only');
  assert.equal(water.temperature, null);
});

test('an open window, an offline zone, a TADO_MODE overlay', () => {
  const state = v2.zoneStates({
    1: {
      openWindow: { detectedTime: '2026-10-13T12:00:00Z', durationInSeconds: 900 },
      link: { state: 'OFFLINE' },
      overlay: {
        termination: {
          type: 'TADO_MODE',
          typeSkillBasedApp: 'NEXT_TIME_BLOCK',
          projectedExpiry: '2026-10-13T21:00:00Z',
        },
      },
    },
  }).zoneStates[1];
  const zone = zoneFromV2(v2.zones[0], state);
  assert.equal(zone.openWindow, true);
  assert.equal(zone.online, false);
  assert.deepEqual(zone.overlay, { type: 'NEXT_TIME_BLOCK', expiresAt: '2026-10-13T21:00:00Z' });
});

test('a tado X room', () => {
  const room = zoneFromX(x.rooms()[0], x.roomsAndDevices.rooms[0].devices);
  assert.equal(room.id, '7');
  assert.equal(room.generation, 'x');
  assert.equal(room.targetTemperature, 23);
  assert.equal(room.temperature, 22.1);
  assert.equal(room.humidity, 48);
  assert.equal(room.heatingPower, 10);
  assert.equal(room.overlay, null);
  assert.deepEqual(room.nextChange, { start: '2026-10-13T20:00:00Z', targetTemperature: 19 });
  assert.equal(room.lowBattery, false);
  const manual = zoneFromX(
    x.rooms({
      manualControlTermination: {
        type: 'TIMER',
        remainingTimeInSeconds: 600,
        projectedExpiry: '2026-10-13T13:00:00Z',
      },
    })[0],
  );
  assert.deepEqual(manual.overlay, { type: 'TIMER', expiresAt: '2026-10-13T13:00:00Z' });
});

test('presence, weather and phones', () => {
  assert.deepEqual(presenceFromState(v2.homeState('HOME', false)), {
    presence: 'home',
    locked: false,
    mode: 'auto',
  });
  assert.deepEqual(presenceFromState(v2.homeState('AWAY', true)), {
    presence: 'away',
    locked: true,
    mode: 'away',
  });
  assert.deepEqual(weatherFromState(v2.weather), {
    outsideTemperature: 12.3,
    solarIntensity: 61.2,
    state: 'CLOUDY_PARTLY',
  });
  assert.deepEqual(phonesFromDevices(v2.mobileDevices), [
    { id: '11', name: 'Phone Jane', atHome: true, stale: false },
  ]);
});
