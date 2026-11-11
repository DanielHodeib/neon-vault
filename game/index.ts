import type { Server } from 'socket.io';
import { z } from 'zod';

import { db, hub, type ChatMessage } from '@/lib/hub';
import { displayRank } from '@/lib/ranks';
import { atLeast } from '@/lib/roles';
import { readCookie, SESSION_COOKIE, userFromToken } from '@/lib/session';
import { registerBlackjack } from './blackjack';
import { registerCoinflip } from './coinflip';
import { registerCrash, startCrash } from './crash';
import { registerPoker } from './poker';
import { id } from './rng';
import { registerRoulette, startRoulette } from './roulette';
import { registerSlots } from './slotsHandler';
import { handle, type GameSocket } from './socket';

const onlineList = () => [...hub.online.values()].map(({ id, username, activity }) => ({ id, username, activity }));

export function setupRealtime(io: Server) {
  hub.io = io;
  startCrash(io);
  startRoulette(io);
  const handlers = [registerCrash, registerRoulette, registerCoinflip, registerSlots, registerBlackjack(io), registerPoker(io)];

  // The session cookie is the only source of identity; nothing from the client is trusted.
  io.use(async (socket, next) => {
    const user = await userFromToken(readCookie(socket.handshake.headers.cookie, SESSION_COOKIE)).catch(() => null);
    if (!user) return next(new Error('unauthorized'));
    socket.data = { user: { id: user.id, username: user.username, role: user.role }, hits: 0, windowStart: 0 };
    next();
  });

  io.on('connection', (raw) => {
    const socket = raw as GameSocket;
    const { user } = socket.data;
    void socket.join(`user:${user.id}`);
    if (atLeast(user.role, 'SUPPORT')) void socket.join('staff');

    const entry = hub.online.get(user.id) ?? { id: user.id, username: user.username, activity: 'Lobby', sockets: 0 };
    entry.sockets++;
    hub.online.set(user.id, entry);
    io.emit('online', onlineList());

    socket.emit('hello', { chat: hub.chat, online: onlineList(), event: hub.event, maintenance: hub.maintenance });

    handle(socket, 'presence', z.object({ activity: z.string().max(40) }), ({ activity }) => {
      entry.activity = activity;
      io.emit('online', onlineList());
    });

    handle(socket, 'chat:send', z.object({ text: z.string().trim().min(1).max(300) }), async ({ text }) => {
      const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      const ownerFriend = (await db.friendship.count({
        where: { accepted: true, OR: [{ fromId: u.id, to: { role: 'OWNER' } }, { toId: u.id, from: { role: 'OWNER' } }] },
      })) > 0;
      const rank = displayRank(u.rankTag, u.xp, Number(u.balance), ownerFriend);
      const msg: ChatMessage = {
        id: id(),
        userId: u.id,
        username: u.username,
        text,
        role: u.role,
        rank: { tag: rank.tag, color: rank.color },
        clanTag: u.clanTag,
        color: u.chatColor,
        at: Date.now(),
      };
      hub.chat = [...hub.chat.slice(-49), msg];
      hub.chatActive.set(u.id, msg.at);
      io.emit('chat', msg);
    });

    for (const register of handlers) register(io, socket);

    socket.on('disconnect', () => {
      if (--entry.sockets <= 0) hub.online.delete(user.id);
      io.emit('online', onlineList());
    });
  });
}
