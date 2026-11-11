import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WHEEL_OPTIONS, WHEEL_SEGMENTS } from '../lib/wheel';
import { pickWeighted } from './jackpot';
import { rand } from './rng';

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
