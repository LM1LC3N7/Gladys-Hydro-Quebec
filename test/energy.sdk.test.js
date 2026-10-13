// The consumption and peak calendar publishers against the SDK's fake Gladys:
// a real GladysIntegration (same argument checks, same payload mapping) whose
// host API answers like Gladys 5.2 (404 on a device not added yet, 403 on an
// undeclared calendar, 400 on an unaligned or unfinished interval).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildContractDevice } from '../src/devices/contract.js';
import { ConsumptionPublisher } from '../src/hydroquebec/consumption.js';
import { CALENDAR_KEY, PEAK, PeakCalendarPublisher } from '../src/hydroquebec/peakCalendar.js';

const logger = { info() {}, warn() {}, error() {} };
const contract = { contractId: '0123456789', accountId: 'a1', rate: 'DPC', rateOption: '', customerNames: ['Test'] };
const now = () => new Date('2026-01-12T18:00:00Z');

// One complete winter day: 48 half-hours from local midnight (05:00Z).
const session = {
  async fetchHourlyConsumption(_contract, dates) {
    return {
      days: dates.map((date) => ({
        date,
        complete: true,
        intervals:
          date === '2026-01-11'
            ? Array.from({ length: 48 }, (_, i) => ({
                starts_at: new Date(Date.parse('2026-01-11T05:00:00Z') + i * 30 * 60 * 1000).toISOString(),
                kwh: 0.75,
              }))
            : [],
      })),
    };
  },
  async fetchPeakEvents() {
    return [{ start: '2026-01-13T11:00:00Z', end: '2026-01-13T15:00:00Z' }];
  },
};

test('SDK fake Gladys: the dated consumption is accepted once the device is added', async () => {
  const gladys = createFakeGladys({ selector: 'hydro-quebec' });
  const publisher = new ConsumptionPublisher({ gladys, logger, now });

  // Not added by the user yet: 404, nothing stored, nothing lost.
  assert.equal(await publisher.publish(session, contract), 0);
  assert.equal(gladys.fake.publishedEnergyConsumption.length, 0);

  const device = buildContractDevice(gladys, contract);
  gladys.fake.devices.push(device);
  assert.equal(await publisher.publish(session, contract), 48);

  const featureId = `${device.external_id}:thirty_minutes_consumption`;
  const stored = gladys.fake.energyConsumption[featureId];
  assert.equal(stored.length, 48);
  // Stamped like the core: at the end of each 30-minute interval.
  assert.equal(stored[0].created_at, '2026-01-11T05:30:00.000Z');
  assert.equal(
    stored.reduce((sum, state) => sum + state.kwh, 0),
    36,
  );
});

test('SDK fake Gladys: the Flex D peak slots land in the declared calendar', async () => {
  const gladys = createFakeGladys({ selector: 'hydro-quebec', energyCalendars: { [CALENDAR_KEY]: [] } });
  const publisher = new PeakCalendarPublisher({ gladys, logger, now });

  assert.equal(await publisher.refresh(session), 8);
  const entries = gladys.fake.energyCalendars[CALENDAR_KEY];
  assert.equal(entries.length, 8);
  assert.ok(entries.every((entry) => entry.value === PEAK));
});

test('SDK fake Gladys: an undeclared calendar (403) stops the publication quietly', async () => {
  const gladys = createFakeGladys({ selector: 'hydro-quebec' });
  const publisher = new PeakCalendarPublisher({ gladys, logger, now });
  assert.equal(await publisher.refresh(session), 0);
  assert.equal(publisher.disabled, true);
});
