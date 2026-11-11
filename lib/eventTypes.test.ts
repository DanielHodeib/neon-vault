import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanParams, defaultParams, describeEvent, EVENT_INFO, EVENT_KEYS } from './eventTypes';

test('event settings are clamped to their range and rounded to their step', () => {
  assert.deepEqual(cleanParams('CASHBACK', { percent: 500 }), { percent: 50 });
  assert.deepEqual(cleanParams('CASHBACK', {}), { percent: 10 });
  assert.deepEqual(cleanParams('BOOST', { factor: 1.234 }), { factor: 1.25 });
  assert.deepEqual(cleanParams('KING', { bonus: Number.NaN }), { bonus: 25_000 });
  assert.equal(cleanParams('RAIN', { min: 7.6 }).min, 8);
});

test('every event has defaults inside its range and a description using all its settings', () => {
  for (const type of EVENT_KEYS) {
    const info = EVENT_INFO[type];
    for (const p of info.params) assert.ok(p.def >= p.min && p.def <= p.max, `${type}.${p.key}`);
    const text = describeEvent(type, defaultParams(type));
    assert.ok(!/\{\w+\}/.test(text), `${type}: ${text}`);
  }
  assert.equal(describeEvent('KING', { bonus: 50_000 }), 'Wer während des Events den höchsten Netto-Gewinn macht, bekommt 50.000 NVC Bonus.');
});
