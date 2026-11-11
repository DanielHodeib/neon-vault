import assert from 'node:assert/strict';
import test from 'node:test';

import { changeLimit, effectiveLimit, LIMIT_DELAY_MS } from './limits';

const now = new Date('2026-11-12T12:00:00Z');
const none = { dailyLimit: null, dailyLimitNext: null, dailyLimitNextAt: null };
const fiveK = { ...none, dailyLimit: 5000n };

test('a stricter limit applies at once', () => {
  assert.deepEqual(changeLimit(none, 1000n, now), { dailyLimit: 1000n, dailyLimitNext: null, dailyLimitNextAt: null });
  assert.equal(changeLimit(fiveK, 2000n, now).dailyLimit, 2000n);
});

test('raising or removing waits a day', () => {
  for (const wanted of [9000n, null]) {
    const u = changeLimit(fiveK, wanted, now);
    assert.equal(u.dailyLimit, 5000n);
    assert.equal(u.dailyLimitNext, wanted);
    assert.equal(effectiveLimit(u, now), 5000n);
    assert.equal(effectiveLimit(u, new Date(now.getTime() + LIMIT_DELAY_MS)), wanted);
  }
});

test('a pending raise can be cancelled by asking for the old limit again', () => {
  const pending = changeLimit(fiveK, 9000n, now);
  assert.deepEqual(changeLimit(pending, 5000n, now), { dailyLimit: 5000n, dailyLimitNext: null, dailyLimitNextAt: null });
});

test('saving the same pending value again keeps the original waiting time', () => {
  const pending = changeLimit(fiveK, 9000n, now);
  const later = new Date(now.getTime() + 3_600_000);
  assert.deepEqual(changeLimit(pending, 9000n, later), pending);
});
