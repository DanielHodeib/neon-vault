import assert from 'node:assert/strict';
import test from 'node:test';

import { kindOf, weekKey } from './tournament';
import { startOfWeek } from './wallet';

test('tournament category rotates week by week', () => {
  const w1 = startOfWeek(new Date('2026-11-11T12:00:00Z'));
  const w2 = new Date(w1.getTime() + 7 * 86_400_000);
  const w3 = new Date(w2.getTime() + 7 * 86_400_000);
  const w4 = new Date(w3.getTime() + 7 * 86_400_000);
  assert.equal(weekKey(w1), '2026-11-09');
  assert.equal(new Set([kindOf(w1), kindOf(w2), kindOf(w3)]).size, 3);
  assert.equal(kindOf(w4), kindOf(w1));
});
