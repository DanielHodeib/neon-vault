import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WHEEL_OPTIONS, WHEEL_SEGMENTS } from '../lib/wheel';
import { pickWeighted } from './jackpot';
import { rand } from './rng';
import { HORSES, racePosition } from '../lib/race';
import { finishTimes, newField } from './race';

test('wheel has 30 segments matching the option counts', () => {
  assert.equal(WHEEL_SEGMENTS.length, 30);
  for (const o of WHEEL_OPTIONS) assert.equal(WHEEL_SEGMENTS.filter((m) => m === o.multiplier).length, o.count);
});

test('every wheel option returns 95–100 %', () => {
  for (const o of WHEEL_OPTIONS) {
    const rtp = (o.multiplier * WHEEL_SEGMENTS.filter((m) => m === o.multiplier).length) / WHEEL_SEGMENTS.length;
    assert.ok(rtp >= 0.95 && rtp <= 1, `${o.multiplier}x returns ${rtp}`);
  }
});

test('pickWeighted respects range boundaries', () => {
  const totals = [1000, 3000, 500];
  assert.equal(pickWeighted(totals, 0), 0);
  assert.equal(pickWeighted(totals, 999.999), 0);
  assert.equal(pickWeighted(totals, 1000), 1);
  assert.equal(pickWeighted(totals, 3999), 1);
  assert.equal(pickWeighted(totals, 4000), 2);
  assert.equal(pickWeighted(totals, 4499.999), 2);
});

test('a 1000/3000 split wins about 25 %/75 %', () => {
  const runs = 100_000;
  let first = 0;
  for (let i = 0; i < runs; i++) if (pickWeighted([1000, 3000], rand() * 4000) === 0) first++;
  assert.ok(Math.abs(first / runs - 0.25) < 0.01, `first won ${first / runs}`);
});

test('race: every horse returns about 95 %, the winner crosses the line first', () => {
  for (let i = 0; i < 200; i++) {
    const field = newField();
    assert.ok(Math.abs(field.reduce((s, h) => s + h.chance, 0) - 1) < 1e-9);
    for (const h of field) assert.ok(h.chance * h.odds <= 0.95 + 1e-9 && h.chance * h.odds > 0.93);
    const winner = i % HORSES.length;
    const times = finishTimes(winner);
    assert.equal(Math.min(...times), times[winner]);
    assert.equal(racePosition(times[winner], times[winner], 7), 1);
    assert.ok(racePosition(times[winner] - 1, times[winner], 7) < 1);
  }
});

test('wheel bonus: the bonus wheel averages exactly 30×, so the gold segment keeps its 100 % return', async () => {
  const { WHEEL_BONUS, WHEEL_BONUS_SEGMENTS } = await import('../lib/wheel');
  const avg = WHEEL_BONUS_SEGMENTS.reduce((s, m) => s + m, 0) / WHEEL_BONUS_SEGMENTS.length;
  assert.equal(avg, 30);
  assert.equal(WHEEL_BONUS_SEGMENTS.length, WHEEL_BONUS.reduce((s, b) => s + b.weight, 0));
  for (const b of WHEEL_BONUS) assert.equal(WHEEL_BONUS_SEGMENTS.filter((m) => m === b.multiplier).length, b.weight);
});
