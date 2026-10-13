import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { IftttClient, parsePayload, validateEventName, valueBody } from '../src/ifttt.js';
import { installFetch, text } from './helpers/fakeFetch.js';

let fake;
afterEach(() => fake?.restore());

test('validateEventName accepts what IFTTT accepts', () => {
  assert.equal(validateEventName(' my_event1 '), 'my_event1');
  for (const bad of ['', 'with space', 'é', 'a/b', null]) {
    assert.throws(() => validateEventName(bad), /Invalid IFTTT event name/);
  }
});

test('valueBody drops the empty values and stringifies the rest', () => {
  assert.deepEqual(valueBody({ value1: 'a', value2: '', value3: 3 }), { value1: 'a', value3: '3' });
  assert.deepEqual(valueBody(), {});
});

test('parsePayload wants a JSON object', () => {
  assert.deepEqual(parsePayload(' {"a": 1} '), { a: 1 });
  assert.deepEqual(parsePayload(''), {});
  assert.throws(() => parsePayload('[1]'), /must be a JSON object/);
  assert.throws(() => parsePayload('{bad'), /not valid JSON/);
});

test('trigger posts the values to the Webhooks service', async () => {
  fake = installFetch(() => text("Congratulations! You've fired the door_open event"));
  const client = new IftttClient({ key: 'k3y' });
  const answer = await client.trigger('door_open', { value1: 'front', value2: '' });
  assert.match(answer, /fired the door_open event/);
  assert.equal(fake.calls[0].url, 'https://maker.ifttt.com/trigger/door_open/with/key/k3y');
  assert.equal(fake.calls[0].init.method, 'POST');
  assert.deepEqual(fake.calls[0].body, { value1: 'front' });
  await client.triggerJson('door_open', { nested: { a: 1 } });
  assert.equal(fake.calls[1].url, 'https://maker.ifttt.com/trigger/door_open/json/with/key/k3y');
  assert.deepEqual(fake.calls[1].body, { nested: { a: 1 } });
});

test('the errors carry a code', async () => {
  const client = new IftttClient({ key: 'k3y' });
  fake = installFetch(() => text('Unauthorized', 401));
  await assert.rejects(client.trigger('e'), (err) => err.code === 'bad_key');
  fake.restore();
  fake = installFetch(() => text('oops', 500));
  await assert.rejects(client.trigger('e'), (err) => err.code === 'ifttt_error');
  fake.restore();
  fake = installFetch(() => {
    const err = new Error('timeout');
    err.name = 'TimeoutError';
    throw err;
  });
  await assert.rejects(client.trigger('e'), (err) => err.code === 'timeout');
  await assert.rejects(new IftttClient({ key: '' }).trigger('e'), (err) => err.code === 'no_key');
});
