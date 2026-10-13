import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inboundEvent, parseRequest } from '../src/inbound.js';

test('a JSON body carries the event, the values and the extra fields', () => {
  const result = inboundEvent({
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify({ event: 'door_open', value1: 'front', extra: { a: 1 }, n: 2 }),
    query: {},
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    event: 'door_open',
    value1: 'front',
    value2: null,
    value3: null,
    payload: '{"extra":{"a":1},"n":2}',
  });
});

test('a form body and a query string work too', () => {
  const form = inboundEvent({
    contentType: 'application/x-www-form-urlencoded',
    body: 'event=lights&value1=on&value2=50',
    query: {},
  });
  assert.equal(form.data.value2, '50');
  const query = inboundEvent({ method: 'GET', body: null, query: { event: 'ping' } });
  assert.deepEqual(query.data, {
    event: 'ping',
    value1: null,
    value2: null,
    value3: null,
    payload: null,
  });
});

test('a plain text body is value1', () => {
  const fields = parseRequest({ contentType: 'text/plain', body: 'hello', query: { event: 'e' } });
  assert.equal(fields.value1, 'hello');
});

test('the shared secret is enforced when set', () => {
  const request = {
    contentType: 'application/json',
    body: '{"event":"x","secret":"abc"}',
    query: {},
  };
  assert.equal(inboundEvent(request, { secret: 'abc' }).ok, true);
  assert.deepEqual(inboundEvent(request, { secret: 'other' }), { ok: false, reason: 'bad_secret' });
  assert.equal(inboundEvent(request).ok, true, 'no secret configured: accepted');
  // The secret may travel in the query string.
  const query = { contentType: null, body: null, query: { event: 'x', secret: 'abc' } };
  assert.equal(inboundEvent(query, { secret: 'abc' }).ok, true);
  assert.equal('secret' in parseRequest(query) && inboundEvent(query).data.payload, null);
});

test('a request without a valid event name is ignored', () => {
  assert.deepEqual(inboundEvent({ body: '{}', query: {} }), { ok: false, reason: 'no_event' });
  assert.deepEqual(inboundEvent({ body: 'not json', contentType: 'application/json', query: {} }), {
    ok: false,
    reason: 'no_event',
  });
  assert.equal(inboundEvent({ body: null, query: { event: 'bad name!' } }).ok, false);
});

test('values are clipped to what a scene event accepts', () => {
  const long = 'x'.repeat(2000);
  const result = inboundEvent({
    body: JSON.stringify({ event: 'e', value1: long, value2: 12 }),
    query: {},
  });
  assert.equal(result.data.value1.length, 1000);
  assert.equal(result.data.value2, '12');
});
