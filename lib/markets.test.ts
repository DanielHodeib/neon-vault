import assert from 'node:assert/strict';
import { test } from 'node:test';

import { marketOdds, marketPayouts } from './markets';

test('markets: winners share the pot minus 3 %, losers get nothing', () => {
  const p = marketPayouts(
    [
      { id: 'a', option: 'A', amount: 100 },
      { id: 'b', option: 'A', amount: 300 },
      { id: 'c', option: 'B', amount: 600 },
    ],
    'A',
  );
  assert.equal(p.get('a')!.amount, 242); // 1000 × 0.97 × 100/400
  assert.equal(p.get('b')!.amount, 727);
  assert.equal(p.get('c')!.amount, 0);
  assert.ok(p.get('a')!.amount + p.get('b')!.amount <= 1000);
});

test('markets: nobody on the winning side → everyone refunded; lopsided pot never pays below the stake', () => {
  const none = marketPayouts([{ id: 'x', option: 'B', amount: 50 }], 'A');
  assert.deepEqual(none.get('x'), { amount: 50, refund: true });
  const onlyWinners = marketPayouts([{ id: 'y', option: 'A', amount: 80 }], 'A');
  assert.equal(onlyWinners.get('y')!.amount, 80);
  assert.equal(marketOdds(0, 100, 'A'), null);
  assert.equal(marketOdds(400, 600, 'A'), 2.425);
});
