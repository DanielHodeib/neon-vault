import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bestHand, bjTotal, handName } from './cards';
import { crashPointFrom } from './crash';
import { rouletteMultiplier } from './roulette';
import { MACHINES, spin } from './slots';

test('blackjack totals handle soft aces', () => {
  assert.equal(bjTotal(['AS', 'KH']), 21);
  assert.equal(bjTotal(['AS', 'AH', '9C']), 21);
  assert.equal(bjTotal(['KS', 'QH', '5C']), 25);
});

test('poker hands rank correctly', () => {
  const flush = bestHand(['2H', '7H', '9H', 'JH', 'KH', '3S', '4D']);
  const straight = bestHand(['5S', '6H', '7D', '8C', '9S', 'KD', '2C']);
  const wheel = bestHand(['AS', '2H', '3D', '4C', '5S', 'KD', 'QC']);
  const fullHouse = bestHand(['3S', '3H', '3D', 'KC', 'KS', '2D', '7C']);
  assert.equal(handName(flush), 'Flush');
  assert.equal(handName(wheel), 'Straße');
  assert.ok(straight > wheel);
  assert.ok(fullHouse > flush && flush > straight);
  assert.ok(bestHand(['AS', 'AH', 'KD', '2C', '7S', '9D', '4C']) > bestHand(['AS', 'AH', 'QD', '2C', '7S', '9D', '4C']));
});

test('every slot machine pays back 85–99 %', () => {
  for (const [key, machine] of Object.entries(MACHINES)) {
    let paid = 0;
    let bets = 0;
    let freeLeft = 0;
    for (let i = 0; i < 300_000 || freeLeft > 0; i++) {
      if (freeLeft > 0) freeLeft--;
      else bets++;
      const r = spin(machine);
      paid += r.multiplier;
      freeLeft += r.freeSpins;
      assert.equal(r.reels.length, machine.reels);
    }
    const rtp = paid / bets;
    assert.ok(rtp > 0.85 && rtp < 0.99, `${key} RTP ${rtp.toFixed(3)}`);
  }
});

test('crash point has a 1 % house edge', () => {
  assert.equal(crashPointFrom(0), 1);
  assert.equal(crashPointFrom(0.5), 1.98);
  let survived = 0;
  for (let i = 0; i < 200_000; i++) if (crashPointFrom(Math.random()) >= 2) survived++;
  assert.ok(Math.abs(survived / 200_000 - 0.495) < 0.01);
});

test('roulette payouts', () => {
  assert.equal(rouletteMultiplier({ type: 'number', value: 17, amount: 1 }, 17), 36);
  assert.equal(rouletteMultiplier({ type: 'red', amount: 1 }, 1), 2);
  assert.equal(rouletteMultiplier({ type: 'red', amount: 1 }, 0), 0);
  assert.equal(rouletteMultiplier({ type: 'dozen', value: 3, amount: 1 }, 36), 3);
  assert.equal(rouletteMultiplier({ type: 'column', value: 1, amount: 1 }, 34), 3);
  assert.equal(rouletteMultiplier({ type: 'even', amount: 1 }, 0), 0);
});
