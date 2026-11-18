import assert from 'node:assert/strict';
import test from 'node:test';

import { CLAN_GOALS, CLAN_LEVEL_XP, CLAN_NAME, CLAN_PERKS, CLAN_TAG, clanLevel, goalReward, perksOf, shopPrice } from './clans';

test('clan name and tag rules', () => {
  assert.ok(CLAN_NAME.test('Neon Wölfe') && CLAN_NAME.test('A-B'));
  assert.ok(!CLAN_NAME.test('ab') && !CLAN_NAME.test('x'.repeat(21)) && !CLAN_NAME.test('<b>hi</b>'));
  assert.ok(CLAN_TAG.test('NIG') && CLAN_TAG.test('A1'));
  assert.ok(!CLAN_TAG.test('a') && !CLAN_TAG.test('TOOLONG') && !CLAN_TAG.test('N G'));
});

test('clan levels and perks', () => {
  assert.equal(clanLevel(0), 1);
  assert.equal(clanLevel(19_999), 1);
  assert.equal(clanLevel(20_000), 2);
  assert.equal(clanLevel(10_000_000), CLAN_LEVEL_XP.length);
  assert.equal(CLAN_PERKS.length, CLAN_LEVEL_XP.length);
  assert.equal(perksOf(99).shopDiscount, 0.1);
  assert.equal(shopPrice(100_000, 5), 90_000);
  assert.equal(goalReward(2, 1), 1_000);
  assert.equal(goalReward(2, 5), 1_300);
});

test('clan goals stay a small share of the stakes that earn them', () => {
  for (const g of CLAN_GOALS) assert.ok((g.reward * 1.3 * 20) / g.volume < 0.35, `tier ${g.tier}`); // a full 30-member clan still gets far less than the volume it plays
  for (const g of CLAN_GOALS) assert.ok(g.reward * 1.3 * 30 < g.volume, `tier ${g.tier}`);
});
