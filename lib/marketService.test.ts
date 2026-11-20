import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { useTempDb } from './testdb';

// Betting markets against a real (temporary) database: stakes, payouts, refunds and who may decide.
type Mods = { hub: typeof import('./hub'); mk: typeof import('./marketService') };
let m: Mods;
let n = 0;

before(async () => {
  useTempDb();
  m = { hub: await import('./hub'), mk: await import('./marketService') };
});
after(() => m.hub.db.$disconnect());

type Role = 'USER' | 'MODERATOR';
const user = async (balance = 10_000, role: Role = 'USER') => {
  const u = await m.hub.db.user.create({ data: { username: `m${n++}`, passwordHash: 'x', balance, role } });
  return { id: u.id, role };
};
const balance = async (id: string) => Number((await m.hub.db.user.findUniqueOrThrow({ where: { id } })).balance);
const open = async (creator: { id: string }) => {
  await m.mk.createMarket(creator.id, { question: 'Regnet es morgen?', optionA: 'Ja', optionB: 'Nein', minutes: 60 });
  return (await m.hub.db.market.findFirstOrThrow({ where: { creatorId: creator.id }, orderBy: { createdAt: 'desc' } })).id;
};

test('creating: the two answers must differ and open markets are capped per player', async () => {
  const c = await user();
  await assert.rejects(m.mk.createMarket(c.id, { question: 'Gleich?', optionA: 'Ja', optionB: 'ja', minutes: 60 }), /unterscheiden/);
  const { MARKET_MAX_OPEN } = await import('./markets');
  for (let i = 0; i < MARKET_MAX_OPEN; i++) await open(c);
  await assert.rejects(open(c), /Maximal/);
});

test('betting: stake leaves, own market / bad option / low stake / closed market are refused', async () => {
  const c = await user();
  const p = await user(1_000);
  const id = await open(c);
  const { MARKET_MIN_BET } = await import('./markets');
  await assert.rejects(m.mk.placeMarketBet(c.id, id, 'A', 100), /eigene/);
  await assert.rejects(m.mk.placeMarketBet(p.id, id, 'C' as 'A', 100), /Ungültige/);
  await assert.rejects(m.mk.placeMarketBet(p.id, id, 'A', MARKET_MIN_BET - 1), /Mindesteinsatz/);
  await assert.rejects(m.mk.placeMarketBet(p.id, id, 'A', 5_000), /Guthaben/);
  assert.equal(await balance(p.id), 1_000, 'refused bets cost nothing');
  await m.mk.placeMarketBet(p.id, id, 'A', 200);
  assert.equal(await balance(p.id), 800);
  await m.hub.db.market.update({ where: { id }, data: { closesAt: new Date(Date.now() - 1000) } });
  await assert.rejects(m.mk.placeMarketBet(p.id, id, 'A', 200), /keine Einsätze/);
  assert.equal(await balance(p.id), 800);
});

test('settling: winners share the pot, the loser gets nothing, a second settle pays nothing more', async () => {
  const c = await user();
  const w = await user(1_000);
  const l = await user(1_000);
  const id = await open(c);
  await m.mk.placeMarketBet(w.id, id, 'A', 100);
  await m.mk.placeMarketBet(l.id, id, 'B', 100);
  await assert.rejects(m.mk.settleMarket(await user(), id, 'A'), /Nur wer/); // a stranger cannot decide
  await m.mk.settleMarket(c, id, 'A');
  assert.equal(await balance(w.id), 900 + 194); // 200 × 0.97
  assert.equal(await balance(l.id), 900);
  await assert.rejects(m.mk.settleMarket(c, id, 'A'), /nicht gefunden/);
  assert.equal(await balance(w.id), 900 + 194, 'not paid twice');
});

test('settling: nobody on the winning side refunds everyone; a moderator may decide', async () => {
  const c = await user();
  const mod = await user(0, 'MODERATOR');
  const p = await user(1_000);
  const id = await open(c);
  await m.mk.placeMarketBet(p.id, id, 'B', 300);
  await m.mk.settleMarket(mod, id, 'A');
  assert.equal(await balance(p.id), 1_000);
});

test('cancelling: every stake comes back, only creator or moderator may, and only once', async () => {
  const c = await user();
  const p1 = await user(1_000);
  const p2 = await user(1_000);
  const id = await open(c);
  await m.mk.placeMarketBet(p1.id, id, 'A', 100);
  await m.mk.placeMarketBet(p2.id, id, 'B', 400);
  await assert.rejects(m.mk.cancelMarket(await user(), id), /Nur wer/);
  await m.mk.cancelMarket(c, id);
  assert.equal(await balance(p1.id), 1_000);
  assert.equal(await balance(p2.id), 1_000);
  await assert.rejects(m.mk.cancelMarket(c, id), /nicht gefunden/);
  assert.equal(await balance(p1.id), 1_000, 'not refunded twice');
});
