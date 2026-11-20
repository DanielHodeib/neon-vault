import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { useTempDb } from '../lib/testdb';

// The shared one-shot round: stake out, payout in, and the stake comes back when the outcome fails.
type Mods = { hub: typeof import('../lib/hub'); instant: typeof import('./instant') };
let m: Mods;
let n = 0;

before(async () => {
  useTempDb();
  m = { hub: await import('../lib/hub'), instant: await import('./instant') };
});
after(() => m.hub.db.$disconnect());

const user = async (balance = 10_000) => (await m.hub.db.user.create({ data: { username: `i${n++}`, passwordHash: 'x', balance } })).id;
const balance = async (id: string) => Number((await m.hub.db.user.findUniqueOrThrow({ where: { id } })).balance);
const kinds = async (id: string) => (await m.hub.db.ledgerEntry.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' } })).map((e) => `${e.kind}:${Number(e.amount)}`);

test('win: stake leaves, payout arrives, the reply is passed through', async () => {
  const u = await user();
  const reply = await m.instant.instantRound(u, 'dice', 100, () => ({ roll: 12.34, payout: 250 }));
  assert.deepEqual(reply, { roll: 12.34, payout: 250 });
  assert.equal(await balance(u), 10_150);
  assert.deepEqual(await kinds(u), ['BET:-100', 'WIN:250']);
});

test('loss: only the stake is booked, no payout entry', async () => {
  const u = await user();
  await m.instant.instantRound(u, 'dice', 100, () => ({ payout: 0 }));
  assert.equal(await balance(u), 9_900);
  assert.deepEqual(await kinds(u), ['BET:-100']);
});

test('push: the stake comes back as a cancelled bet, and the flag is not in the reply', async () => {
  const u = await user();
  const reply = await m.instant.instantRound(u, 'baccarat', 100, () => ({ payout: 100, refund: true }));
  assert.deepEqual(reply, { payout: 100 });
  assert.equal(await balance(u), 10_000);
  assert.deepEqual(await kinds(u), ['BET:-100', 'CANCEL:100']);
});

test('a failing outcome gives the stake back instead of eating it', async () => {
  const u = await user();
  await assert.rejects(m.instant.instantRound(u, 'dice', 100, () => { throw new Error('boom'); }), /boom/);
  assert.equal(await balance(u), 10_000);
  assert.deepEqual(await kinds(u), ['BET:-100', 'CANCEL:100']);
});

test('not enough money: nothing is played', async () => {
  const u = await user(50);
  let played = false;
  await assert.rejects(m.instant.instantRound(u, 'dice', 100, () => ((played = true), { payout: 0 })), /Guthaben/);
  assert.equal(played, false);
  assert.equal(await balance(u), 50);
});
