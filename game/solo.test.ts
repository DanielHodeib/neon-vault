import assert from 'node:assert/strict';
import { test } from 'node:test';

import { diceChance, diceMultiplier, hiloChance, hiloStep, minesMultiplier, PLINKO, PLINKO_ROWS } from '../lib/solo';
import { judge } from './hilo';
import { randInt } from './rng';

const choose = (n: number, k: number) => {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c;
};

test('plinko tables are symmetric and pay back 97–99 %', () => {
  for (const [risk, table] of Object.entries(PLINKO)) {
    assert.equal(table.length, PLINKO_ROWS + 1, risk);
    assert.deepEqual(table, [...table].reverse(), risk);
    const rtp = table.reduce((s, m, k) => s + (m * choose(PLINKO_ROWS, k)) / 2 ** PLINKO_ROWS, 0);
    assert.ok(rtp >= 0.97 && rtp <= 0.99, `${risk} RTP ${rtp}`);
  }
});

test('dice multiplier and win chance', () => {
  assert.equal(diceMultiplier(50), 1.98);
  assert.equal(diceMultiplier(diceChance(98, 'under')), 1.01);
  const n = 200_000;
  let wins = 0;
  for (let i = 0; i < n; i++) if (randInt(10_000) / 100 < 25) wins++;
  assert.ok(Math.abs(wins / n - 0.25) < 0.01, `under 25 hit ${wins / n}`);
});

test('mines multiplier matches the formula and grows with each reveal', () => {
  assert.equal(minesMultiplier(3, 0), 1);
  assert.equal(minesMultiplier(1, 1), 1.03);
  let p = 1;
  for (let i = 0; i < 5; i++) p *= (22 - i) / (25 - i);
  assert.equal(minesMultiplier(3, 5), Math.floor((0.99 / p) * 100) / 100);
  for (let mines = 1; mines <= 24; mines++) {
    for (let r = 1; r <= 25 - mines; r++) assert.ok(minesMultiplier(mines, r) > minesMultiplier(mines, r - 1), `${mines}/${r}`);
  }
});

test('hi-lo: chances, ties count for the player, every guess returns at most 98 %', () => {
  assert.equal(hiloChance(2, 'higher'), 1);
  assert.equal(hiloChance(14, 'higher'), 1 / 13);
  assert.equal(hiloChance(2, 'lower'), 1 / 13);
  assert.ok(judge('7S', '7H', 'higher') && judge('7S', '7H', 'lower'));
  assert.ok(!judge('7S', '6H', 'higher') && !judge('7S', '8H', 'lower'));
  for (let v = 2; v <= 14; v++) {
    for (const g of ['higher', 'lower'] as const) {
      const p = hiloChance(v, g);
      if (p < 1) assert.ok(p * hiloStep(p) <= 0.98 + 1e-9 && p * hiloStep(p) > 0.95, `${v} ${g}`);
    }
  }
});
