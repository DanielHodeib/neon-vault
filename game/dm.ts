import { z } from 'zod';

import { db, emitToUser, UserError } from '@/lib/hub';
import { empty, handle, type Register } from './socket';

const username = z.string().min(1).max(20);

/** Private messages: friends only, never past a block (same rules as /tip). */
export const registerDm: Register = (_io, socket) => {
  const { user } = socket.data;

  const partner = async (name: string) => {
    const other = await db.user.findUnique({ where: { username: name.replace(/^@/, '') }, select: { id: true, username: true } });
    if (!other || other.id === user.id) throw new UserError('Spieler nicht gefunden.');
    return other;
  };

  handle(socket, 'dm:unread', empty, async () => ({ unread: await db.directMessage.count({ where: { toId: user.id, readAt: null } }) }));

  handle(socket, 'dm:threads', empty, async () => {
    const recent = await db.directMessage.findMany({
      where: { OR: [{ fromId: user.id }, { toId: user.id }] },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { fromId: true, text: true, createdAt: true, readAt: true, toId: true, from: { select: { username: true } }, to: { select: { username: true } } },
    });
    const threads = new Map<string, { username: string; text: string; at: number; mine: boolean; unread: number }>();
    for (const m of recent) {
      const mine = m.fromId === user.id;
      const name = mine ? m.to.username : m.from.username;
      const t = threads.get(name) ?? { username: name, text: m.text, at: m.createdAt.getTime(), mine, unread: 0 };
      if (!mine && !m.readAt) t.unread++;
      threads.set(name, t);
    }
    return { threads: [...threads.values()] };
  });

  handle(socket, 'dm:history', z.object({ with: username }), async ({ with: name }) => {
    const other = await partner(name);
    const pair = [{ fromId: user.id, toId: other.id }, { fromId: other.id, toId: user.id }];
    const messages = await db.directMessage.findMany({ where: { OR: pair }, orderBy: { createdAt: 'desc' }, take: 100 });
    await db.directMessage.updateMany({ where: { fromId: other.id, toId: user.id, readAt: null }, data: { readAt: new Date() } });
    return {
      username: other.username,
      messages: messages.reverse().map((m) => ({ id: m.id, mine: m.fromId === user.id, text: m.text, at: m.createdAt.getTime() })),
    };
  });

  handle(socket, 'dm:send', z.object({ to: username, text: z.string().trim().min(1).max(500) }), async ({ to, text }) => {
    const other = await partner(to);
    const pair = [{ fromId: user.id, toId: other.id }, { fromId: other.id, toId: user.id }];
    if (await db.block.count({ where: { OR: pair } })) throw new UserError('Nicht möglich – einer von euch hat den anderen blockiert.');
    if (!(await db.friendship.count({ where: { accepted: true, OR: pair } }))) throw new UserError('Nachrichten gehen nur an Freunde.');
    const m = await db.directMessage.create({ data: { fromId: user.id, toId: other.id, text } });
    const payload = { id: m.id, from: user.username, to: other.username, text, at: m.createdAt.getTime() };
    emitToUser(other.id, 'dm', payload);
    emitToUser(user.id, 'dm', payload);
    return { message: payload };
  });

  handle(socket, 'dm:read', z.object({ with: username }), async ({ with: name }) => {
    const other = await partner(name);
    await db.directMessage.updateMany({ where: { fromId: other.id, toId: user.id, readAt: null }, data: { readAt: new Date() } });
  });
};
