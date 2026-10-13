import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callsOf, hostsOf, infoOf, lineOf, missedCalls, wanOf } from '../src/livebox/model.js';
import { normalizeConfig } from '../src/config.js';
import {
  boxStates,
  buildBoxDevice,
  buildHostDevice,
  ids,
  parseExternalId,
} from '../src/devices.js';
import { callEvents, hostEvents, internetEvents } from '../src/triggers.js';
import * as fx from './fixtures/livebox.js';

const gladys = { externalId: (s) => `ext:livebox:${s}` };

test('the LAN devices are normalized and deduplicated by MAC', () => {
  const hosts = hostsOf(fx.devices());
  assert.equal(hosts.length, 3);
  const phone = hosts.find((h) => h.name === 'Phone Jane');
  assert.equal(phone.mac, 'AA:BB:CC:DD:EE:01');
  assert.equal(phone.active, true);
  assert.equal(phone.wireless, true);
  assert.equal(phone.ip, '192.168.1.20');
  const laptop = hosts.find((h) => h.name === 'Laptop');
  assert.equal(laptop.mac, 'AA:BB:CC:DD:EE:02', 'uppercased');
  const nas = hosts.find((h) => h.name === 'NAS');
  assert.equal(nas.wireless, false);
  assert.deepEqual(hostsOf({}), []);
});

test('WAN, info, line and calls', () => {
  const wan = wanOf(fx.wanStatus());
  assert.equal(wan.connected, true);
  assert.equal(wan.linkType, 'dsl');
  assert.equal(wan.ip, '82.1.2.3');
  assert.equal(wanOf(fx.wanStatus({ connected: false })).connected, false);
  const info = infoOf(fx.deviceInfo);
  assert.equal(info.model, 'Livebox 5');
  assert.equal(info.uptimeSeconds, 277200);
  const line = lineOf(fx.dsl);
  assert.equal(line.available, true);
  assert.equal(line.downMbps, 52.3);
  assert.equal(line.upMbps, 12);
  assert.equal(lineOf({}).available, false);
  const calls = callsOf(fx.calls());
  assert.equal(calls[0].type, 'missed', 'newest first');
  assert.equal(missedCalls(calls).length, 1);
  assert.equal(calls[1].name, 'Alice');
});

test('the configuration', () => {
  const config = normalizeConfig({
    host: 'http://livebox.home/',
    password: 'x',
    poll_frequency: '5',
  });
  assert.equal(config.host, 'livebox.home');
  assert.equal(config.pollFrequency, 10);
  assert.equal(config.username, 'admin');
  assert.equal(config.trackWired, false);
  assert.equal(config.watchCalls, true);
});

test('devices, ids and states', () => {
  const box = buildBoxDevice(gladys, { info: infoOf(fx.deviceInfo), line: lineOf(fx.dsl) });
  assert.equal(box.external_id, 'ext:livebox:box');
  assert.equal(box.name, 'Livebox (Livebox 5)');
  assert.ok(box.features.some((f) => f.external_id.endsWith(':download_rate')));
  assert.equal(
    buildBoxDevice(gladys, {}).features.some((f) => f.external_id.endsWith(':download_rate')),
    false,
  );
  const host = buildHostDevice(gladys, hostsOf(fx.devices())[0]);
  assert.equal(host.external_id, 'ext:livebox:host:aabbccddee01');
  assert.deepEqual(parseExternalId(host.external_id), { kind: 'host', id: 'aabbccddee01' });
  assert.deepEqual(parseExternalId('ext:livebox:box'), { kind: 'box' });
  assert.equal(parseExternalId('ext:livebox:other'), undefined);
  const states = boxStates(ids.box(gladys), {
    wan: wanOf(fx.wanStatus()),
    info: infoOf(fx.deviceInfo),
    wifi: true,
    guest: false,
    hosts: hostsOf(fx.devices()),
    calls: callsOf(fx.calls()),
    line: lineOf(fx.dsl),
  });
  const byKey = Object.fromEntries(
    states.map((s) => [s.device_feature_external_id.split(':').at(-1), s.state ?? s.text]),
  );
  assert.equal(byKey.internet, 1);
  assert.equal(byKey.uptime, 77);
  assert.equal(byKey.devices_online, 3);
  assert.equal(byKey.wifi_devices_online, 2);
  assert.equal(byKey.missed_calls, 1);
  assert.equal(byKey.last_call, 'missed: 0155667788');
  assert.equal(byKey.download_rate, 52.3);
});

test('transitions', () => {
  const before = new Map(hostsOf(fx.devices()).map((h) => [h.mac, h]));
  const after = hostsOf(fx.devices({ phoneActive: false }));
  const tracked = (mac) => (mac === 'AA:BB:CC:DD:EE:01' ? 'dev-phone' : undefined);
  const events = hostEvents(tracked, before, after);
  assert.equal(events.length, 1);
  assert.equal(events[0].key, 'device_disconnected');
  assert.equal(events[0].data.device, 'dev-phone');
  assert.equal(events[0].data.name, 'Phone Jane');
  assert.deepEqual(hostEvents(tracked, undefined, after), []);
  const calls = callsOf(fx.calls());
  const more = callsOf(
    fx.calls({
      extra: [
        {
          callId: '14',
          remoteNumber: '0699',
          callType: 'missed',
          startTime: '2026-10-13T11:00:00Z',
        },
      ],
    }),
  );
  assert.equal(callEvents(calls, more).length, 1);
  assert.equal(callEvents(calls, more)[0].data.number, '0699');
  assert.deepEqual(callEvents(undefined, more), []);
  const down = internetEvents(wanOf(fx.wanStatus()), wanOf(fx.wanStatus({ connected: false })));
  assert.equal(down[0].data.state, 'down');
  assert.equal(down[0].data.error, 'ERROR_NO_CARRIER');
  assert.deepEqual(internetEvents(wanOf(fx.wanStatus()), wanOf(fx.wanStatus())), []);
});
