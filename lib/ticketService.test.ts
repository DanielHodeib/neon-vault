import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { useTempDb } from './testdb';

// Who may answer a ticket and which status each answer leaves behind.
type Mods = { hub: typeof import('./hub'); t: typeof import('./ticketService') };
let m: Mods;
let n = 0;

before(async () => {
  useTempDb();
  m = { hub: await import('./hub'), t: await import('./ticketService') };
});
after(() => m.hub.db.$disconnect());

type Role = 'USER' | 'SUPPORT';
const user = async (role: Role = 'USER') => ({ id: (await m.hub.db.user.create({ data: { username: `t${n++}`, passwordHash: 'x', role } })).id, role });
const ticket = (userId: string) => m.hub.db.ticket.create({ data: { userId, subject: 'Hilfe', category: 'Konto', messages: { create: { senderId: userId, content: 'Frage' } } } });
const state = (id: string) => m.hub.db.ticket.findUniqueOrThrow({ where: { id }, include: { messages: true } });

test('staff answer marks ANSWERED and notifies the owner; the owner answering reopens it', async () => {
  const owner = await user();
  const staff = await user('SUPPORT');
  const tk = await ticket(owner.id);
  await m.t.replyTicket(staff, tk.id, 'Gelöst?');
  let s = await state(tk.id);
  assert.equal(s.status, 'ANSWERED');
  assert.equal(s.messages.at(-1)!.isStaff, true);
  assert.equal(await m.hub.db.notification.count({ where: { userId: owner.id, title: 'Support-Antwort' } }), 1);
  await m.t.replyTicket(owner, tk.id, 'Nein');
  s = await state(tk.id);
  assert.equal(s.status, 'OPEN');
  assert.equal(s.messages.at(-1)!.isStaff, false);
});

test('a stranger cannot read or answer someone else’s ticket; a missing ticket is not found', async () => {
  const owner = await user();
  const other = await user();
  const tk = await ticket(owner.id);
  await assert.rejects(m.t.replyTicket(other, tk.id, 'hi'), /nicht gefunden/);
  await assert.rejects(m.t.replyTicket(owner, 'missing', 'hi'), /nicht gefunden/);
  assert.equal((await state(tk.id)).messages.length, 1);
});

test('a closed ticket takes no more answers', async () => {
  const owner = await user();
  const tk = await ticket(owner.id);
  await m.hub.db.ticket.update({ where: { id: tk.id }, data: { status: 'CLOSED' } });
  await assert.rejects(m.t.replyTicket(owner, tk.id, 'hi'), /geschlossen/);
});
