import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StatePublisher } from '../src/devices/statePublisher.js';

const live = (id, state) => ({ device_feature_external_id: id, state });
const dated = (id, state, createdAt) => ({ device_feature_external_id: id, state, created_at: createdAt });

test('StatePublisher: a live state is republished only when its value changes', () => {
  const publisher = new StatePublisher();
  assert.equal(publisher.changed([live('balance', 10)]).length, 1);
  publisher.commit([live('balance', 10)]);
  assert.equal(publisher.changed([live('balance', 10)]).length, 0);
  assert.equal(publisher.changed([live('balance', 12.5)]).length, 1);
});

test('StatePublisher: nothing is recorded until commit (a failed publish is retried)', () => {
  const publisher = new StatePublisher();
  publisher.changed([live('balance', 10)]);
  assert.equal(publisher.changed([live('balance', 10)]).length, 1);
});

test('StatePublisher: a dated state is published once per day, never for an older day', () => {
  const publisher = new StatePublisher();
  const day1 = dated('daily', 40, '2026-01-12T00:00:00-05:00');
  publisher.commit(publisher.changed([day1]));
  assert.equal(publisher.changed([day1]).length, 0, 'same day: already stored');
  assert.equal(publisher.changed([dated('daily', 41, '2026-01-11T00:00:00-05:00')]).length, 0, 'older day');
  assert.equal(publisher.changed([dated('daily', 52, '2026-01-13T00:00:00-05:00')]).length, 1, 'newer day');
});

test('StatePublisher: seeds from what Gladys already has, and forgets on demand', () => {
  const publisher = new StatePublisher();
  publisher.seed([
    {
      features: [
        { external_id: 'balance', last_value: 10, last_value_changed: '2026-01-14T15:00:00.000Z' },
        { external_id: 'daily', last_value: 40, last_value_changed: '2026-01-13T05:00:00.000Z' },
      ],
    },
  ]);
  assert.equal(publisher.changed([live('balance', 10)]).length, 0);
  assert.equal(publisher.changed([dated('daily', 40, '2026-01-13T00:00:00-05:00')]).length, 0);
  publisher.forget(['balance']);
  assert.equal(publisher.changed([live('balance', 10)]).length, 1);
});
