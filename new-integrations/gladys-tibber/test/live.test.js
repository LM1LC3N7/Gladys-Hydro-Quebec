import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveSubscription } from '../src/tibber/live.js';
import { createSocketFactory } from './helpers/fakeSocket.js';
import { createFakeTimers } from './helpers/fakeTimers.js';
import { measurement } from './fixtures/tibber.js';

const quiet = { info() {}, warn() {}, error() {}, debug() {} };

test('the graphql-transport-ws handshake, measurements and reconnection', async () => {
  const { sockets, factory } = createSocketFactory();
  const timers = createFakeTimers();
  const received = [];
  const statuses = [];
  const live = new LiveSubscription({
    homeId: 'h1',
    token: 'tok',
    onMeasurement: (m) => received.push(m),
    onStatus: (s) => statuses.push(s),
    logger: quiet,
    socketFactory: factory,
    timers,
  });
  live.start();
  const [socket] = sockets;
  socket.open();
  assert.deepEqual(socket.sent[0], { type: 'connection_init', payload: { token: 'tok' } });
  socket.receive({ type: 'connection_ack' });
  assert.equal(socket.sent[1].type, 'subscribe');
  assert.match(socket.sent[1].payload.query, /liveMeasurement\(homeId: "h1"\)/);
  assert.deepEqual(statuses, [true]);
  socket.receive({ type: 'ping' });
  assert.deepEqual(socket.sent[2], { type: 'pong' });
  socket.receive({
    id: '1',
    type: 'next',
    payload: { data: { liveMeasurement: measurement(800) } },
  });
  assert.equal(received[0].power, 800);
  // The connection drops: reconnect after the base delay, then with backoff.
  socket.drop();
  assert.deepEqual(statuses, [true, false]);
  assert.equal(timers.timeouts()[0].ms, 5000);
  await timers.runTimeouts();
  assert.equal(sockets.length, 2);
  sockets[1].drop();
  assert.equal(timers.timeouts()[0].ms, 10000);
  live.stop();
  assert.equal(timers.pending.size, 0);
  await timers.runTimeouts();
  assert.equal(sockets.length, 2, 'no reconnection once stopped');
});
