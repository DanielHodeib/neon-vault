import assert from 'node:assert/strict';
import { test } from 'node:test';

import { achievements } from './achievements';

test('achievements unlock at their thresholds', () => {
  const none = achievements({ bets: 0, biggestWin: 0, level: 1, friends: 0, gamesPlayed: 0, duelWins: 0, marketWins: 0 });
  assert.ok(none.every((a) => !a.done));
  const some = achievements({ bets: 100, biggestWin: 10_000, level: 10, friends: 4, gamesPlayed: 3, duelWins: 0, marketWins: 0 });
  assert.deepEqual(some.filter((a) => a.done).map((a) => a.key), ['first-bet', 'bets-100', 'win-10k', 'level-10']);
});
