import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EVENT_INFO } from '../lib/eventTypes';
import { boostedWin } from '../lib/events';
import { hub } from '../lib/hub';
import { DAILY_BONUS, DAILY_COUNT, QUESTS, WEEKLY_BONUS, WEEKLY_COUNT } from '../lib/quests';
import { MACHINES } from '../lib/slots';
import { LEVEL_REWARD, LEVEL_REWARD_MAX } from '../lib/wallet';
import { spin } from './slots';

// Guards for the coin economy: free money stays moderate and no event turns a game into a money printer.

test('boost: extra coins stop at the per-player cap of the event', () => {
  hub.event = { type: 'BOOST', label: '', description: '', params: { factor: 2, cap: 5_000 }, startedAt: 0, endsAt: Date.now() + 60_000 };
  hub.eventBonusPaid = new Map();
  assert.equal(boostedWin('avia', 'u1', 1_000), 2_000); // 1000 extra
  assert.equal(boostedWin('avia', 'u1', 10_000), 14_000); // only 4000 extra left
  assert.equal(boostedWin('avia', 'u1', 10_000), 10_000); // cap reached
  assert.equal(boostedWin('avia', 'u2', 1_000), 2_000); // other players have their own cap
  assert.equal(boostedWin('slots', 'u2', 1_000), 1_000); // only Avia Masters and coinflip are boosted
  hub.event = null;
  assert.equal(boostedWin('avia', 'u3', 1_000), 1_000);
});

test('events: boost and cashback have a per-player cap, jackpot rush stays at or below 1.5×', () => {
  for (const type of ['BOOST', 'CASHBACK'] as const) assert.ok(EVENT_INFO[type].params.some((p) => p.key === 'cap'), type);
  const rush = EVENT_INFO.JACKPOT_RUSH.params.find((p) => p.key === 'factor')!;
  assert.ok(rush.max <= 1.5);
});

// Jackpots are rare and big, so 120k spins still swing a few percent: the bound leaves room for that.
test('slots: even with the strongest jackpot rush no machine pays back clearly more than 100 %', () => {
  const max = EVENT_INFO.JACKPOT_RUSH.params[0].max;
  for (const key of ['highroller', 'luxor', 'chaos']) {
    let sum = 0;
    const n = 120_000;
    for (let i = 0; i < n; i++) sum += spin(MACHINES[key], { rush: max }).multiplier;
    assert.ok(sum / n < 1.05, `${key}: ${((sum / n) * 100).toFixed(1)} %`);
  }
});

test('quests and levels: free coins stay moderate', () => {
  // Worst case: the best-paid quests of a period all show up together, plus the all-done bonus.
  const best = (weekly: boolean, n: number) => QUESTS.filter((q) => q.weekly === weekly).map((q) => q.reward).sort((a, b) => b - a).slice(0, n).reduce((s, r) => s + r, 0);
  const daily = best(false, DAILY_COUNT) + DAILY_BONUS;
  const weekly = best(true, WEEKLY_COUNT) + WEEKLY_BONUS;
  assert.ok(daily <= 35_000, `daily ${daily}`);
  assert.ok(weekly <= 230_000, `weekly ${weekly}`);
  assert.equal(Math.min(100 * LEVEL_REWARD, LEVEL_REWARD_MAX), 10_000);
});
