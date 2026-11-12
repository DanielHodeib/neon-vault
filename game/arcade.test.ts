import assert from 'node:assert/strict';
import { test } from 'node:test';

import { KENO_DRAWN, KENO_NUMBERS, KENO_PAYS, limboChance, SCRATCH_FIELDS, SCRATCH_PRIZES, TOWER_DOORS, TOWER_FLOORS, towerMultiplier, VIDEO_POKER_PAYS } from '../lib/arcade';
import { newDeck } from './cards';
import { baccaratDeal, baccaratReturn, evaluateVideoPoker, kenoResult, limboResult, scratchCard } from './arcade';

const choose = (n: number, k: number) => {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c;
};

test('scratch card: 98 % payout rate, the card always shows exactly its prize', () => {
  const rtp = SCRATCH_PRIZES.reduce((s, p) => s + p.multiplier * p.chance, 0);
  assert.ok(Math.abs(rtp - 0.98) < 1e-9, `RTP ${rtp}`);
  for (let i = 0; i < 3000; i++) {
    const card = scratchCard(i / 3000);
    assert.equal(card.fields.length, SCRATCH_FIELDS);
    const counts = Object.values(card.fields.reduce<Record<string, number>>((m, s) => ({ ...m, [s]: (m[s] ?? 0) + 1 }), {}));
    const threes = counts.filter((c) => c >= 3);
    if (card.multiplier) assert.deepEqual(threes, [3], `card ${card.fields}`);
    else assert.equal(threes.length, 0, `losing card ${card.fields}`);
  }
});

test('keno: every pick count returns 94–98 %, hits are counted right', () => {
  for (const [picks, row] of Object.entries(KENO_PAYS)) {
    const k = Number(picks);
    const rtp = Object.entries(row).reduce((s, [h, m]) => s + (m * choose(k, Number(h)) * choose(KENO_NUMBERS - k, KENO_DRAWN - Number(h))) / choose(KENO_NUMBERS, KENO_DRAWN), 0);
    assert.ok(rtp >= 0.94 && rtp <= 0.98, `${k} picks RTP ${rtp}`);
  }
  assert.deepEqual(kenoResult([1, 2, 3], [3, 2, 9, 10, 11, 12, 13, 14, 15, 16]), { hits: 2, multiplier: 4 });
  assert.deepEqual(kenoResult([5], [1, 2, 3, 4, 6, 7, 8, 9, 10, 11]), { hits: 0, multiplier: 0 });
});

test('tower: 97 % at every floor, multipliers grow', () => {
  for (const risk of ['easy', 'medium', 'hard'] as const) {
    const safe = (TOWER_DOORS[risk] - 1) / TOWER_DOORS[risk];
    for (let f = 1; f <= TOWER_FLOORS; f++) {
      const rtp = towerMultiplier(risk, f) * safe ** f;
      assert.ok(rtp <= 0.97 + 1e-9 && rtp > 0.95, `${risk} floor ${f}: ${rtp}`);
      assert.ok(towerMultiplier(risk, f) > towerMultiplier(risk, f - 1));
    }
  }
});

test('video poker: Jacks or Better hands', () => {
  assert.equal(evaluateVideoPoker(['AS', 'KS', 'QS', 'JS', 'TS']), 'royal');
  assert.equal(evaluateVideoPoker(['5H', '4H', '3H', '2H', 'AH']), 'straightFlush');
  assert.equal(evaluateVideoPoker(['9S', '9H', '9D', '9C', '2S']), 'quads');
  assert.equal(evaluateVideoPoker(['9S', '9H', '9D', '2C', '2S']), 'fullHouse');
  assert.equal(evaluateVideoPoker(['2D', '7D', '9D', 'JD', 'KD']), 'flush');
  assert.equal(evaluateVideoPoker(['6S', '7H', '8D', '9C', 'TS']), 'straight');
  assert.equal(evaluateVideoPoker(['4S', '4H', '4D', 'KC', '2S']), 'trips');
  assert.equal(evaluateVideoPoker(['4S', '4H', 'KD', 'KC', '2S']), 'twoPair');
  assert.equal(evaluateVideoPoker(['JS', 'JH', '4D', '8C', '2S']), 'jacks');
  assert.equal(evaluateVideoPoker(['TS', 'TH', '4D', '8C', '2S']), null);
  assert.equal(evaluateVideoPoker(['AS', '3H', '6D', '9C', 'QS']), null);
  assert.equal(VIDEO_POKER_PAYS[0].key, 'royal');
});

test('limbo: hit rate matches 0.99 / target', () => {
  const n = 200_000;
  for (const target of [2, 10]) {
    let hits = 0;
    for (let i = 0; i < n; i++) if (limboResult() >= target) hits++;
    assert.ok(Math.abs(hits / n - limboChance(target)) < 0.006, `target ${target}: ${hits / n}`);
  }
  assert.equal(limboResult(0), 0.99); // the lowest possible result always loses
});

test('baccarat: natural/third-card rules give the known odds and returns', () => {
  const n = 120_000;
  const wins = { player: 0, banker: 0, tie: 0 };
  let deck = newDeck(8);
  for (let i = 0; i < n; i++) {
    if (deck.length < 10) deck = newDeck(8);
    wins[baccaratDeal(deck).winner]++;
  }
  const p = { player: wins.player / n, banker: wins.banker / n, tie: wins.tie / n };
  assert.ok(Math.abs(p.banker - 0.4586) < 0.008 && Math.abs(p.player - 0.4462) < 0.008 && Math.abs(p.tie - 0.0952) < 0.006, JSON.stringify(p));
  const rtp = (side: 'player' | 'banker' | 'tie') => (['player', 'banker', 'tie'] as const).reduce((s, w) => s + p[w] * baccaratReturn(side, w), 0);
  assert.ok(rtp('player') > 0.97 && rtp('player') < 1.0, `player ${rtp('player')}`);
  assert.ok(rtp('banker') > 0.97 && rtp('banker') < 1.0, `banker ${rtp('banker')}`);
  assert.ok(rtp('tie') > 0.8 && rtp('tie') < 0.92, `tie ${rtp('tie')}`);
  // fixed hand (dealt from the end): player 8 + K = 8, banker Q + 9 = 9 – both naturals, nobody draws
  const hand = baccaratDeal(['5S', '4S', '9H', 'QC', 'KH', '8D']);
  assert.deepEqual([hand.playerTotal, hand.bankerTotal, hand.winner, hand.player.length, hand.banker.length], [8, 9, 'banker', 2, 2]);
});
