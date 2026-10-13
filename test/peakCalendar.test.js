import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CALENDAR_KEY, NORMAL, PEAK, PeakCalendarPublisher, peakSlots } from '../src/hydroquebec/peakCalendar.js';

const logger = { info() {}, warn() {}, error() {} };

function fakeGladys({ stored = [], fail } = {}) {
  return {
    published: [],
    reads: 0,
    async getEnergyCalendar(key) {
      assert.equal(key, CALENDAR_KEY);
      this.reads += 1;
      if (fail) throw fail;
      return stored;
    },
    async publishEnergyCalendar(key, entries) {
      assert.equal(key, CALENDAR_KEY);
      if (fail) throw fail;
      this.published.push(entries);
      return { success: true, count: entries.length, changed_from: null };
    },
  };
}

const session = (events) => ({ fetchPeakEvents: async () => events });
// 06:00-10:00 in Montréal on January 13th.
const morning = { start: '2026-01-13T11:00:00Z', end: '2026-01-13T15:00:00Z' };

test('peakSlots: one 30-minute slot per half-hour of each event', () => {
  const slots = peakSlots([morning, { start: '2026-01-13T21:00:00Z', end: '2026-01-14T00:00:00Z' }]);
  assert.equal(slots.length, 8 + 6);
  assert.equal(slots[0], '2026-01-13T11:00:00.000Z');
  assert.equal(slots[7], '2026-01-13T14:30:00.000Z');
  assert.deepEqual(peakSlots([{ start: 'nope', end: morning.end }]), []);
});

test('PeakCalendarPublisher: publishes the announced slots once', async () => {
  const gladys = fakeGladys();
  const publisher = new PeakCalendarPublisher({ gladys, logger, now: () => new Date('2026-01-12T18:00:00Z') });

  assert.equal(await publisher.refresh(session([morning])), 8);
  assert.ok(gladys.published[0].every((entry) => entry.value === PEAK));
  // Nothing new: nothing sent, and Gladys is read back only once.
  assert.equal(await publisher.refresh(session([morning])), 0);
  assert.equal(gladys.published.length, 1);
  assert.equal(gladys.reads, 1);
});

test('PeakCalendarPublisher: a cancelled upcoming peak goes back to normal, a past one never does', async () => {
  // Gladys already holds tomorrow's peak, published before a restart.
  const gladys = fakeGladys({
    stored: peakSlots([morning]).map((starts_at) => ({ starts_at, value: PEAK })),
  });
  let now = new Date('2026-01-12T18:00:00Z');
  const publisher = new PeakCalendarPublisher({ gladys, logger, now: () => now });

  // The feed no longer lists it: cancelled.
  assert.equal(await publisher.refresh(session([])), 8);
  assert.ok(gladys.published[0].every((entry) => entry.value === NORMAL));

  // Announced again, held, then the feed drops it once it is over: kept.
  await publisher.refresh(session([morning]));
  now = new Date('2026-01-14T18:00:00Z');
  assert.equal(await publisher.refresh(session([])), 0);
});

test('PeakCalendarPublisher: a calendar owned by another integration stops the publication', async () => {
  const gladys = fakeGladys({ fail: Object.assign(new Error('Forbidden'), { status: 403 }) });
  const publisher = new PeakCalendarPublisher({ gladys, logger, now: () => new Date('2026-01-12T18:00:00Z') });
  assert.equal(await publisher.refresh(session([morning])), 0);
  assert.equal(publisher.disabled, true);
  assert.equal(await publisher.refresh(session([morning])), 0);
  assert.equal(gladys.reads, 1);
});

test('PeakCalendarPublisher: other failures are thrown and retried next time', async () => {
  const gladys = fakeGladys({ fail: Object.assign(new Error('Server error'), { status: 500 }) });
  const publisher = new PeakCalendarPublisher({ gladys, logger, now: () => new Date('2026-01-12T18:00:00Z') });
  await assert.rejects(publisher.refresh(session([morning])), /Server error/);
  assert.equal(publisher.disabled, false);
  assert.equal(publisher.loaded, false);
});
