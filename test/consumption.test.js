import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConsumptionPublisher, addDays, dayRange, easternDay, nextCursor } from '../src/hydroquebec/consumption.js';

const logger = { info() {}, warn() {}, error() {} };

function fakeGladys({ fail } = {}) {
  return {
    published: [],
    externalIds: (kind, id) => ({ feature: (key) => `ext:hq:${kind}:${id}:${key}` }),
    async publishEnergyConsumption(featureExternalId, intervals) {
      if (fail) throw fail;
      this.published.push({ featureExternalId, intervals });
      return { success: true, count: intervals.length, changed_from: null };
    },
  };
}

/** A session whose bridge returns one complete day of 48 intervals per date asked. */
function fakeSession({ incomplete = [] } = {}) {
  return {
    asked: [],
    async fetchHourlyConsumption(contract, dates) {
      this.asked.push(dates);
      return {
        days: dates.map((date) => ({
          date,
          complete: !incomplete.includes(date),
          intervals: Array.from({ length: 48 }, (_, i) => ({
            starts_at: new Date(Date.parse(`${date}T05:00:00Z`) + i * 30 * 60 * 1000).toISOString(),
            kwh: 0.5,
          })),
        })),
      };
    },
  };
}

const contract = { contractId: '123' };

test('easternDay: the Eastern calendar day, not the UTC one', () => {
  assert.equal(easternDay(new Date('2026-01-13T03:00:00Z')), '2026-01-12');
  assert.equal(easternDay(new Date('2026-01-13T05:00:00Z')), '2026-01-13');
  assert.equal(easternDay(new Date('2026-07-01T03:59:00Z')), '2026-06-30');
});

test('addDays and dayRange cross month and year boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.deepEqual(dayRange('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  assert.deepEqual(dayRange('2026-01-02', '2026-01-01'), []);
});

test('nextCursor: complete days settle after 2 days, incomplete ones are given up after 7', () => {
  const today = '2026-01-20';
  const day = (date, complete) => ({ date, complete });
  // 18th complete and 2 days old: settled; 19th complete but recent: read again.
  assert.equal(
    nextCursor([day('2026-01-18', true), day('2026-01-19', true)], ['2026-01-18', '2026-01-19'], today),
    '2026-01-19',
  );
  // An incomplete day blocks the cursor until it is 7 days old.
  assert.equal(nextCursor([day('2026-01-14', false)], ['2026-01-14'], today), '2026-01-14');
  assert.equal(nextCursor([day('2026-01-13', false)], ['2026-01-13'], today), '2026-01-14');
  // Everything settled: the cursor moves past the last day read.
  assert.equal(nextCursor([day('2026-01-10', true)], ['2026-01-10'], today), '2026-01-11');
});

test('ConsumptionPublisher: backfills from the 1st of the month, 10 days per run, then follows the recent days', async () => {
  const gladys = fakeGladys();
  const session = fakeSession();
  let now = new Date('2026-01-20T15:00:00Z'); // 10:00 in Montréal
  const publisher = new ConsumptionPublisher({ gladys, logger, now: () => now });

  await publisher.publish(session, contract);
  assert.deepEqual(session.asked[0], dayRange('2026-01-01', '2026-01-10'));
  assert.equal(gladys.published[0].featureExternalId, 'ext:hq:contract:123:thirty_minutes_consumption');
  assert.equal(gladys.published[0].intervals.length, 480);

  await publisher.publish(session, contract);
  assert.deepEqual(session.asked[1], dayRange('2026-01-11', '2026-01-20'));
  // Today's intervals that are not over yet are never sent: at 10:00 local
  // (15:00Z), the elapsed half-hours of the day start from 05:00Z to 14:30Z.
  const today = gladys.published[1].intervals.filter(
    (i) => Date.parse(i.starts_at) >= Date.parse('2026-01-20T05:00:00Z'),
  );
  assert.equal(today.length, 20);
  assert.ok(today.every((i) => Date.parse(i.starts_at) + 30 * 60 * 1000 <= now.getTime()));

  // Next run: the two recent days only (read again for late corrections).
  now = new Date('2026-01-21T15:00:00Z');
  await publisher.publish(session, contract);
  assert.deepEqual(session.asked[2], ['2026-01-19', '2026-01-20', '2026-01-21']);
});

test('ConsumptionPublisher: a device not added in Gladys yet keeps the same days for the next run', async () => {
  const err = Object.assign(new Error('Not found'), { status: 404 });
  const gladys = fakeGladys({ fail: err });
  const session = fakeSession();
  const publisher = new ConsumptionPublisher({ gladys, logger, now: () => new Date('2026-01-05T15:00:00Z') });

  assert.equal(await publisher.publish(session, contract), 0);
  assert.equal(await publisher.publish(session, contract), 0);
  assert.deepEqual(session.asked[0], session.asked[1]);
});

test('ConsumptionPublisher: any other failure is thrown and the cursor does not move', async () => {
  const err = Object.assign(new Error('Bad request'), { status: 400 });
  const gladys = fakeGladys({ fail: err });
  const session = fakeSession();
  const publisher = new ConsumptionPublisher({ gladys, logger, now: () => new Date('2026-01-05T15:00:00Z') });

  await assert.rejects(publisher.publish(session, contract), /Bad request/);
  assert.equal(publisher.cursors.size, 0);
});

test('ConsumptionPublisher: sends at most 2,000 intervals per call', async () => {
  const gladys = fakeGladys();
  const start = Date.parse('2025-12-01T05:00:00Z');
  const session = {
    async fetchHourlyConsumption(_contract, dates) {
      const intervals = Array.from({ length: 4500 }, (_, i) => ({
        starts_at: new Date(start + i * 30 * 60 * 1000).toISOString(),
        kwh: 0.5,
      }));
      return { days: [{ date: dates[0], complete: true, intervals }] };
    },
  };
  const publisher = new ConsumptionPublisher({ gladys, logger, now: () => new Date('2026-03-31T15:00:00Z') });
  await publisher.publish(session, contract);
  assert.deepEqual(
    gladys.published.map((call) => call.intervals.length),
    [2000, 2000, 500],
  );
});
