import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { useTempDb } from './testdb';

// Mutes, chat history and the admin log live in the database, so a restart loses none of them.
type Mods = { hub: typeof import('./hub'); chat: typeof import('./chatlog'); mod: typeof import('./moderation'); audit: typeof import('./audit') };
let m: Mods;

before(async () => {
  useTempDb();
  m = { hub: await import('./hub'), chat: await import('./chatlog'), mod: await import('./moderation'), audit: await import('./audit') };
});
after(() => m.hub.db.$disconnect());

const newUser = (name: string) => m.hub.db.user.create({ data: { username: name, passwordHash: 'x' } });

test('mute: survives a restart, expires, and can be lifted', async () => {
  const { hub, db } = m.hub;
  const [a, b, c] = await Promise.all([newUser('muted_a'), newUser('muted_b'), newUser('muted_c')]);
  await m.mod.setMute(a.id, 30);
  await m.mod.setMute(b.id, 30);
  await m.mod.setMute(b.id, 0); // lifted again
  await db.user.update({ where: { id: c.id }, data: { mutedUntil: new Date(Date.now() - 1000) } }); // already over
  assert.ok(m.hub.isMuted(a.id) && !m.hub.isMuted(b.id));

  hub.muted.clear(); // "restart"
  await m.mod.loadMutes();
  assert.ok(m.hub.isMuted(a.id), 'running mute is back');
  assert.ok(!m.hub.isMuted(b.id), 'lifted mute stays lifted');
  assert.ok(!m.hub.isMuted(c.id), 'expired mute is not restored');
});

test('chat history: keeps the newest N per channel, oldest first, channels apart', async () => {
  const { saveChat, loadChat, dropChat } = m.chat;
  for (let i = 1; i <= 5; i++) await saveChat('global', { n: i }, 3);
  await saveChat('clan:1', { n: 99 }, 3);
  assert.deepEqual(await loadChat('global', 3), [{ n: 3 }, { n: 4 }, { n: 5 }]);
  assert.deepEqual(await loadChat('clan:1', 3), [{ n: 99 }]);
  await dropChat('global');
  assert.deepEqual(await loadChat('global', 3), []);
  assert.equal((await loadChat('clan:1', 3)).length, 1, 'clearing one channel leaves the others');
});

test('audit log: records who did what to whom', async () => {
  await m.audit.audit({ id: 'u1', username: 'boss' }, 'Sperre', { username: 'cheater' }, '24 h');
  await m.audit.audit({ id: 'u1', username: 'boss' }, 'Backup');
  const rows = await m.hub.db.auditLog.findMany({ orderBy: { at: 'asc' } });
  assert.deepEqual(rows.map((r) => [r.actorName, r.action, r.targetName, r.detail]), [
    ['boss', 'Sperre', 'cheater', '24 h'],
    ['boss', 'Backup', null, null],
  ]);
});

test('admin: balance can be set to an exact value, down to zero, and is booked as ADMIN entries', async () => {
  const u = await newUser('rich_or_poor');
  assert.equal(await m.mod.setBalanceTo(u.id, 5_000_000, 'gesetzt'), 5_000_000 - 10_000);
  assert.equal(Number((await m.hub.db.user.findUniqueOrThrow({ where: { id: u.id } })).balance), 5_000_000);
  assert.equal(await m.mod.setBalanceTo(u.id, 5_000_000, 'gesetzt'), 0); // nothing to do, no entry
  assert.equal(await m.mod.setBalanceTo(u.id, 0, 'gesetzt'), -5_000_000);
  assert.equal(Number((await m.hub.db.user.findUniqueOrThrow({ where: { id: u.id } })).balance), 0);
  const entries = await m.hub.db.ledgerEntry.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
  assert.deepEqual(entries.map((e) => [e.kind, Number(e.amount)]), [['ADMIN', 4_990_000], ['ADMIN', -5_000_000]]);
});
