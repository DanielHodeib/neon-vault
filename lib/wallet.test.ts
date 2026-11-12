import assert from 'node:assert/strict';
import { test } from 'node:test';

import { betXp } from './wallet';

test('bet XP grows with the stake: nothing below 10 NVC, full 10 XP from 100 NVC', () => {
  assert.equal(betXp(1n), 0);
  assert.equal(betXp(9n), 0);
  assert.equal(betXp(10n), 1);
  assert.equal(betXp(55n), 5);
  assert.equal(betXp(100n), 10);
  assert.equal(betXp(1_000_000n), 10);
});
