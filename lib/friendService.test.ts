import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { useTempDb } from './testdb';

// Friends, blocks, money and likes, against a real (temporary) database.
type Mods = { hub: typeof import('./hub'); f: typeof import('./friendService') };
let m: Mods;
let n = 0;

before(async () => {
  useTempDb();
  m = { hub: await import('./hub'), f: await import('./friendService') };
});
after(() => m.hub.db.$disconnect());

const user = async (balance = 10_000) => {
  const u = await m.hub.db.user.create({ data: { username: `f${n++}`, passwordHash: 'x', balance } });
  return { id: u.id, username: u.username };
};
const balance = async (id: string) => Number((await m.hub.db.user.findUniqueOrThrow({ where: { id } })).balance);
const friends = async (a: string, b: string) => (await m.hub.db.friendship.findMany({ where: { OR: [{ fromId: a, toId: b }, { fromId: b, toId: a }] } })).map((f) => f.accepted);
const befriend = async (a: { id: string; username: string }, b: { id: string; username: string }) => {
  await m.f.sendFriendRequest(a, b.username);
  await m.f.respondFriend(b, a.id, true);
};

test('request → accept makes a friendship; repeats and yourself are refused', async () => {
  const a = await user();
  const b = await user();
  assert.equal(await m.f.sendFriendRequest(a, b.username), 'Anfrage gesendet.');
  assert.deepEqual(await friends(a.id, b.id), [false]);
  await assert.rejects(m.f.sendFriendRequest(a, b.username), /schon gesendet/);
  await assert.rejects(m.f.sendFriendRequest(a, a.username), /selbst/);
  await assert.rejects(m.f.sendFriendRequest(a, 'nobody-here'), /nicht gefunden/);
  await m.f.respondFriend(b, a.id, true);
  assert.deepEqual(await friends(a.id, b.id), [true]);
  await assert.rejects(m.f.sendFriendRequest(b, a.username), /schon befreundet/);
});

test('asking back someone who asked you accepts instead of making a second row', async () => {
  const a = await user();
  const b = await user();
  await m.f.sendFriendRequest(a, b.username);
  assert.match(await m.f.sendFriendRequest(b, a.username), /befreundet/);
  assert.deepEqual(await friends(a.id, b.id), [true]);
});

test('only the addressee can answer; declining removes the request', async () => {
  const a = await user();
  const b = await user();
  const c = await user();
  await m.f.sendFriendRequest(a, b.username);
  await assert.rejects(m.f.respondFriend(c, a.id, true), /nicht mehr/); // a stranger cannot accept it
  await assert.rejects(m.f.respondFriend(a, b.id, true), /nicht mehr/); // the asker cannot accept their own
  assert.equal(await m.f.respondFriend(b, a.id, false), 'Anfrage abgelehnt.');
  assert.deepEqual(await friends(a.id, b.id), []);
});

test('blocking ends the friendship and stops new requests; unblocking allows them again', async () => {
  const a = await user();
  const b = await user();
  await befriend(a, b);
  await m.f.setBlocked(a.id, b.id, true);
  assert.deepEqual(await friends(a.id, b.id), []);
  await assert.rejects(m.f.sendFriendRequest(b, a.username), /blockiert/);
  await assert.rejects(m.f.sendFriendRequest(a, b.username), /blockiert/);
  await m.f.setBlocked(a.id, b.id, true); // twice is fine
  await m.f.setBlocked(a.id, b.id, false);
  assert.equal(await m.f.sendFriendRequest(b, a.username), 'Anfrage gesendet.');
  await m.f.setBlocked(a.id, a.id, true); // blocking yourself does nothing
  assert.equal(await m.hub.db.block.count({ where: { fromId: a.id, toId: a.id } }), 0);
});

test('money goes to friends only, moves exactly the amount, and bad amounts change nothing', async () => {
  const a = await user(1_000);
  const b = await user(0);
  await assert.rejects(m.f.sendMoney(a, b.username, 100, ''), /Nur an Freunde/);
  await befriend(a, b);
  await m.f.sendMoney(a, b.username, 250, 'hi');
  assert.equal(await balance(a.id), 750);
  assert.equal(await balance(b.id), 250);
  await assert.rejects(m.f.sendMoney(a, b.username, 5_000, ''), /Guthaben/);
  await assert.rejects(m.f.sendMoney(a, b.username, -50, ''));
  await assert.rejects(m.f.sendMoney(a, a.username, 10, ''), /selbst/);
  assert.equal(await balance(a.id), 750, 'failed sends cost nothing');
  assert.equal(await balance(b.id), 250);
  const kinds = await m.hub.db.ledgerEntry.findMany({ where: { kind: 'TRANSFER', userId: { in: [a.id, b.id] } } });
  assert.equal(kinds.length, 2, 'one entry per side, nothing from the failed sends');
});

test('likes toggle, and you cannot like yourself or a missing player', async () => {
  const a = await user();
  const b = await user();
  await m.f.toggleLike(a.id, b.id);
  assert.equal(await m.hub.db.profileLike.count({ where: { toId: b.id } }), 1);
  await m.f.toggleLike(a.id, b.id);
  assert.equal(await m.hub.db.profileLike.count({ where: { toId: b.id } }), 0);
  await assert.rejects(m.f.toggleLike(a.id, a.id), /eigenes/);
  await assert.rejects(m.f.toggleLike(a.id, 'missing-id'), /nicht gefunden/);
});
