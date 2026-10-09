import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PythonBridge } from '../src/hydroquebec/pythonBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '..', 'test-fixtures', 'echoBridge.js');
const DEAD_FIXTURE_PATH = path.join(__dirname, '..', 'test-fixtures', 'deadBridge.js');

const silentLogger = { info() {}, debug() {}, warn() {}, error() {} };

function newBridge() {
  // The fixture is plain Node, not Python: run it with the current Node binary.
  return new PythonBridge({ logger: silentLogger, scriptPath: FIXTURE_PATH, pythonExecutable: process.execPath });
}

test('PythonBridge: call() resolves with the result of a matching response', async () => {
  const bridge = newBridge();
  try {
    const result = await bridge.call('discover', { username: 'demo' });
    assert.deepEqual(result, { echo: { id: 1, cmd: 'discover', username: 'demo' } });
  } finally {
    bridge.stop();
  }
});

test('PythonBridge: call() rejects when the bridge reports ok:false', async () => {
  const bridge = newBridge();
  try {
    await assert.rejects(bridge.call('boom'), /boom failed/);
  } finally {
    bridge.stop();
  }
});

test('PythonBridge: concurrent calls are correlated by id, not call order', async () => {
  const bridge = newBridge();
  try {
    const [slow, fast] = await Promise.all([bridge.call('slow'), bridge.call('discover')]);
    assert.equal(slow, 'late');
    assert.deepEqual(fast, { echo: { id: 2, cmd: 'discover' } });
  } finally {
    bridge.stop();
  }
});

test('PythonBridge: a dead process rejects every pending call', async () => {
  const bridge = newBridge();
  const pending = bridge.call('slow'); // never answered: the process exits first
  await assert.rejects(bridge.call('exit'), /exited/);
  await assert.rejects(pending, /exited/);
});

test('PythonBridge: a process that dies while a request is being written rejects the call instead of crashing', async () => {
  // Large enough to overflow the pipe buffer, so the write is still pending
  // when the process exits and fails with EPIPE: before stdin had an 'error'
  // listener, that EPIPE was an uncaught exception taking the whole
  // integration down.
  const bridge = new PythonBridge({
    logger: silentLogger,
    scriptPath: DEAD_FIXTURE_PATH,
    pythonExecutable: process.execPath,
  });
  try {
    await assert.rejects(bridge.call('discover', { padding: 'x'.repeat(1_000_000) }, { timeoutMs: 5000 }));
  } finally {
    bridge.stop();
  }
});

test('PythonBridge: generation tracks restarts of the process', async () => {
  const bridge = newBridge();
  try {
    await bridge.call('discover');
    const generation = bridge.generation;
    assert.equal(bridge.hasRestartedSince(generation), false);

    await assert.rejects(bridge.call('exit'), /exited/);
    assert.equal(bridge.hasRestartedSince(generation), true, 'down counts as restarted');

    await bridge.call('discover'); // respawns the process
    assert.equal(bridge.generation, generation + 1);
    assert.equal(bridge.hasRestartedSince(generation), true);
  } finally {
    bridge.stop();
  }
});
