import assert from 'node:assert/strict';
import test from 'node:test';

import { DAILY_COUNT, DAILY_POOL, pick, QUESTS, WEEKLY_COUNT, WEEKLY_POOL } from './quests';

test('quest keys are unique and targets sensible', () => {
  assert.equal(new Set(QUESTS.map((q) => q.key)).size, QUESTS.length);
  for (const q of QUESTS) assert.ok(q.target > 0 && Number.isInteger(q.reward) && q.reward > 0, q.key);
});

test('quests rotate: same for everyone, no repeats inside a cycle, changes every period', () => {
  for (const [pool, n] of [[DAILY_POOL, DAILY_COUNT], [WEEKLY_POOL, WEEKLY_COUNT]] as const) {
    const cycle = Math.floor(pool.length / n);
    for (let start = 0; start < 5 * cycle; start += cycle) {
      const seen = new Set<string>();
      for (let i = start; i < start + cycle; i++) {
        const today = pick(pool, n, i).map((q) => q.key);
        assert.equal(today.length, n);
        assert.equal(new Set(today).size, n);
        assert.deepEqual(today, pick(pool, n, i).map((q) => q.key));
        for (const k of today) assert.ok(!seen.has(k), `${k} twice in one cycle`);
        today.forEach((k) => seen.add(k));
      }
    }
    // the next period is never the same set
    for (let i = 0; i < 40; i++) assert.notDeepEqual(pick(pool, n, i).map((q) => q.key), pick(pool, n, i + 1).map((q) => q.key));
  }
});
