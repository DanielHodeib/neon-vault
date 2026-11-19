import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AVIA_ITEMS, AVIA_LAND, AVIA_MAX, AVIA_SLOTS, AVIA_START, AVIA_WEIGHT_TOTAL, aviaApply, aviaFlight, aviaItemAt, aviaPayout } from '@/lib/avia';
import { randInt } from './rng';

test('avia: items change the multiplier as advertised', () => {
  assert.equal(aviaApply(1, { kind: 'add', n: 5 }), 6);
  assert.equal(aviaApply(2, { kind: 'mul', n: 3 }), 6);
  assert.equal(aviaApply(3, { kind: 'rocket' }), 1.5);
  assert.equal(aviaApply(1.5, { kind: 'rocket' }), 0.75);
  assert.equal(aviaApply(2.5, { kind: 'none' }), 2.5);
  assert.equal(aviaApply(900, { kind: 'mul', n: 5 }), AVIA_MAX, 'capped');
});

test('avia: every draw maps to an item, the table is complete', () => {
  assert.equal(AVIA_ITEMS.reduce((n, i) => n + i.weight, 0), AVIA_WEIGHT_TOTAL);
  assert.deepEqual(aviaItemAt(0), AVIA_ITEMS[0].item);
  assert.deepEqual(aviaItemAt(AVIA_WEIGHT_TOTAL - 1), AVIA_ITEMS.at(-1)!.item);
});

test('avia: a flight is consistent (steps follow the items, payout only on landing)', () => {
  for (let i = 0; i < 2_000; i++) {
    const f = aviaFlight(randInt);
    assert.equal(f.items.length, AVIA_SLOTS);
    let m = AVIA_START;
    f.items.forEach((item, k) => assert.equal((m = aviaApply(m, item)), f.steps[k]));
    assert.equal(f.multiplier, m);
    assert.equal(aviaPayout(100, f), f.landed ? Math.floor(100 * f.multiplier) : 0);
  }
});

test('avia: the exact return is 96–98 %', () => {
  // Every multiplier with its probability, by walking all item sequences slot by slot.
  let dist = new Map<number, number>([[AVIA_START, 1]]);
  for (let s = 0; s < AVIA_SLOTS; s++) {
    const next = new Map<number, number>();
    for (const [m, p] of dist) for (const { item, weight } of AVIA_ITEMS) {
      const to = aviaApply(m, item);
      next.set(to, (next.get(to) ?? 0) + (p * weight) / AVIA_WEIGHT_TOTAL);
    }
    dist = next;
  }
  assert.ok(Math.abs([...dist.values()].reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const rtp = AVIA_LAND * [...dist].reduce((sum, [m, p]) => sum + m * p, 0);
  assert.ok(rtp > 0.96 && rtp < 0.98, `RTP ${rtp}`);
});

test('avia: simulated play lands about as often as promised', () => {
  const n = 40_000;
  let landed = 0;
  for (let i = 0; i < n; i++) if (aviaFlight(randInt).landed) landed++;
  assert.ok(Math.abs(landed / n - AVIA_LAND) < 0.012);
});
