import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HydroQcSession } from '../src/hydroquebec/session.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAKE_BRIDGE_PATH = path.join(__dirname, '..', 'test-fixtures', 'fakeHqBridge.js');

const silentLogger = { info() {}, debug() {}, warn() {}, error() {} };

function newSession() {
  return new HydroQcSession('user', 'pass', silentLogger, {
    scriptPath: FAKE_BRIDGE_PATH,
    pythonExecutable: process.execPath,
  });
}

async function crashBridge(session) {
  const exited = new Promise((resolve) => session.bridge.process.once('exit', resolve));
  session.bridge.process.kill();
  await exited;
}

test('HydroQcSession: ensureContracts reuses the cached contracts while the bridge stays up', async () => {
  const session = newSession();
  try {
    await session.ensureContracts();
    const first = session.contracts;
    assert.equal(first.length, 1);
    assert.equal(first[0].contractId, '0123456789');

    await session.ensureContracts();
    assert.equal(session.contracts, first, 'no second discovery within the TTL');
  } finally {
    session.stop();
  }
});

test('HydroQcSession: a respawned bridge has lost its contract cache (the failure being guarded against)', async () => {
  const session = newSession();
  try {
    await session.ensureContracts();
    const [contract] = session.contracts;
    await crashBridge(session);
    await assert.rejects(session.fetchContractSnapshot(contract), /Unknown contract/);
  } finally {
    session.stop();
  }
});

test('HydroQcSession: ensureContracts re-discovers after the bridge process was restarted', async () => {
  const session = newSession();
  try {
    await session.ensureContracts();
    const first = session.contracts;
    await crashBridge(session);

    await session.ensureContracts();
    assert.notEqual(session.contracts, first, 'discovery ran again');
    assert.deepEqual(await session.fetchContractSnapshot(session.contracts[0]), { daily_consumption_kwh: 42 });
  } finally {
    session.stop();
  }
});
