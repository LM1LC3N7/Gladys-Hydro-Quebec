import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PeakTracker, RATE, SCENE_TRIGGER, normalizePeakState } from '../src/hydroquebec/peakTracker.js';
import { PeakScheduler, isAnnouncementWindow, transitionInstants } from '../src/hydroquebec/peakScheduler.js';
import { PeakMonitor, hasPeaks } from '../src/hydroquebec/peakMonitor.js';

const silentLogger = { info() {}, debug() {}, warn() {}, error() {} };
const contract = { contractId: '0123456789', rate: 'DPC', rateOption: '' };
const PEAK = {
  start: '2027-01-20T06:00:00-05:00',
  end: '2027-01-20T10:00:00-05:00',
  preheat_start: '2027-01-20T03:00:00-05:00',
  period: 'morning',
};
const dpc = (fields) => normalizePeakState(RATE.FLEX_D, { critical_peaks: [PEAK], ...fields });

test('PeakTracker: the first reading only records, then each transition fires once', () => {
  const tracker = new PeakTracker();
  const keys = (state) => tracker.observe(contract, 'ext:hq:contract:1', state).map((e) => e.key);

  assert.deepEqual(keys(normalizePeakState(RATE.FLEX_D, { critical_peaks: [] })), [], 'first reading');
  assert.deepEqual(keys(dpc({})), [SCENE_TRIGGER.PEAK_ANNOUNCED]);
  assert.deepEqual(keys(dpc({})), [], 'already announced');
  assert.deepEqual(keys(dpc({ preheat_in_progress: true })), [SCENE_TRIGGER.PREHEAT_STARTED]);
  assert.deepEqual(keys(dpc({ peak_in_progress: true })), [SCENE_TRIGGER.PEAK_STARTED]);
  assert.deepEqual(keys(normalizePeakState(RATE.FLEX_D, { critical_peaks: [] })), [SCENE_TRIGGER.PEAK_ENDED]);
});

test('PeakTracker: a restart never re-announces nor replays a transition', () => {
  const tracker = new PeakTracker();
  assert.deepEqual(tracker.observe(contract, 'dev', dpc({ peak_in_progress: true })), []);
});

test('PeakTracker: event data reads as the Eastern local clock', () => {
  const tracker = new PeakTracker();
  tracker.observe(contract, 'ext:hq:contract:1', normalizePeakState(RATE.FLEX_D, { critical_peaks: [] }));
  const [event] = tracker.observe(contract, 'ext:hq:contract:1', dpc({}));
  assert.deepEqual(event.data, {
    contract: 'ext:hq:contract:1',
    contract_id: '0123456789',
    rate: 'flex_d',
    period: 'morning',
    day: '2027-01-20',
    start_time: '06:00',
    end_time: '10:00',
    starts_at: PEAK.start,
    ends_at: PEAK.end,
  });
});

test('PeakTracker: the Winter Credit peak in progress comes from critical_peak_in_progress', () => {
  const state = normalizePeakState(RATE.WINTER_CREDIT, { critical_peak_in_progress: true, peak_in_progress: false });
  assert.equal(state.inProgress, true);
});

test('transitionInstants: pre-heat start, start and end within the horizon, sorted', () => {
  const now = Date.parse('2027-01-20T04:00:00-05:00');
  assert.deepEqual(transitionInstants([PEAK], now), [Date.parse(PEAK.start), Date.parse(PEAK.end)]);
  assert.deepEqual(transitionInstants([PEAK], Date.parse('2027-01-10T00:00:00-05:00')), [], 'beyond 48 h');
  assert.deepEqual(transitionInstants([{ start: 'not a date' }], now), []);
});

test('isAnnouncementWindow: 10:30 to 15:00 Eastern, whatever the host time zone', () => {
  assert.equal(isAnnouncementWindow(new Date('2027-01-20T10:29:00-05:00')), false);
  assert.equal(isAnnouncementWindow(new Date('2027-01-20T10:30:00-05:00')), true);
  assert.equal(isAnnouncementWindow(new Date('2027-01-20T14:59:00-05:00')), true);
  assert.equal(isAnnouncementWindow(new Date('2027-01-20T15:00:00-05:00')), false);
  assert.equal(isAnnouncementWindow(new Date('2026-07-20T11:00:00-04:00')), true, 'summer time');
});

test('PeakScheduler: fires a refresh just after each upcoming transition', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fired = [];
  const scheduler = new PeakScheduler({
    logger: silentLogger,
    onTransition: async (contractId) => fired.push(contractId),
    onAnnouncementCheck: async () => {},
  });
  const now = Date.now();
  const at = (ms) => new Date(now + ms).toISOString();
  assert.equal(scheduler.schedule('c1', [{ preheat_start: at(60_000), start: at(120_000), end: at(180_000) }], now), 3);

  t.mock.timers.tick(60_000);
  assert.deepEqual(fired, [], 'not before the 5 s safety delay');
  t.mock.timers.tick(5_000);
  assert.deepEqual(fired, ['c1']);
  t.mock.timers.tick(120_000);
  assert.deepEqual(fired, ['c1', 'c1', 'c1']);
});

test('PeakScheduler: re-arming replaces the previous timers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fired = [];
  const scheduler = new PeakScheduler({
    logger: silentLogger,
    onTransition: async (contractId) => fired.push(contractId),
    onAnnouncementCheck: async () => {},
  });
  const now = Date.now();
  scheduler.schedule('c1', [{ start: new Date(now + 60_000).toISOString() }], now);
  assert.equal(scheduler.schedule('c1', [], now), 0);
  t.mock.timers.tick(120_000);
  assert.deepEqual(fired, []);
  scheduler.stop();
});

test('PeakMonitor: publishes changed peak features, fires scene events, re-arms the timers', async () => {
  const published = [];
  const events = [];
  const scheduled = [];
  const gladys = {
    externalIds: (kind, id) => ({ device: `ext:hq:${kind}:${id}`, feature: (k) => `ext:hq:${kind}:${id}:${k}` }),
    publishStates: async (states) => published.push(...states),
    publishSceneEvent: async (key, data) => events.push({ key, data }),
  };
  const readings = [
    { dpc: { current_state: 'normal', peak_in_progress: false, preheat_in_progress: false, critical_peaks: [] } },
    { dpc: { current_state: 'normal', peak_in_progress: false, preheat_in_progress: true, critical_peaks: [PEAK] } },
  ];
  const session = {
    contracts: [contract],
    getContract: (id) => (id === contract.contractId ? contract : null),
    fetchPeakState: async () => readings.shift(),
  };
  const monitor = new PeakMonitor({
    gladys,
    logger: silentLogger,
    publisher: null,
    context: () => ({ session, config: {} }),
    scheduler: { schedule: (id, peaks) => scheduled.push([id, peaks.length]), stop() {}, startAnnouncementChecks() {} },
  });

  await monitor.refreshContract(contract.contractId);
  assert.deepEqual(events, [], 'first reading only records');
  await monitor.checkAnnouncements();
  assert.deepEqual(
    events.map((e) => e.key),
    [SCENE_TRIGGER.PEAK_ANNOUNCED, SCENE_TRIGGER.PREHEAT_STARTED],
  );
  assert.ok(published.some((s) => s.device_feature_external_id.endsWith(':dpc_preheat_in_progress') && s.state === 1));
  assert.deepEqual(scheduled, [
    [contract.contractId, 0],
    [contract.contractId, 1],
  ]);
});

test('PeakMonitor: a failing scene event never blocks the rest', async () => {
  const gladys = {
    externalIds: (kind, id) => ({ device: `d:${id}`, feature: (k) => `f:${k}` }),
    publishSceneEvent: async () => {
      throw new Error('404 unknown trigger');
    },
  };
  const scheduled = [];
  const monitor = new PeakMonitor({
    gladys,
    logger: silentLogger,
    publisher: null,
    context: () => ({ session: null, config: {} }),
    scheduler: { schedule: (id) => scheduled.push(id), stop() {}, startAnnouncementChecks() {} },
  });
  await monitor.handle(contract, { dpc: { critical_peaks: [] } });
  await monitor.handle(contract, { dpc: { critical_peaks: [PEAK] } });
  assert.equal(scheduled.length, 2);
});

test('hasPeaks: Winter Credit and Flex D contracts only', () => {
  assert.equal(hasPeaks({ rate: 'DPC', rateOption: '' }), true);
  assert.equal(hasPeaks({ rate: 'D', rateOption: 'CPC' }), true);
  assert.equal(hasPeaks({ rate: 'D', rateOption: '' }), false);
});
