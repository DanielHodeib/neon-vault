import type { Server } from 'socket.io';
import { z } from 'zod';

import { systemMessage } from '@/lib/events';
import { db, hub, notify, UserError, type ChatMessage } from '@/lib/hub';
import { displayRank } from '@/lib/ranks';
import { shopItem } from '@/lib/shop';
import { atLeast } from '@/lib/roles';
import { applyLedger, assertAmount, settleInflight } from '@/lib/wallet';
import { readCookie, SESSION_COOKIE, userFromToken } from '@/lib/session';
import { refundBlackjack, registerBlackjack } from './blackjack';
import { refundCoinflip, registerCoinflip } from './coinflip';
import { refundCrash, registerCrash, startCrash } from './crash';
import { refundPoker, registerPoker } from './poker';
import { id } from './rng';
import { refundRoulette, registerRoulette, startRoulette } from './roulette';
import { registerSlots } from './slotsHandler';
import { registerDice } from './dice';
import { registerDm } from './dm';
import { refundHilo, registerHilo } from './hilo';
import { refundRace, registerRace, startRace } from './race';
import { refundJackpot, registerJackpot } from './jackpot';
import { refundMines, registerMines } from './mines';
import { registerPlinko } from './plinko';
import { refundWheel, registerWheel, startWheel } from './wheel';
import { empty, handle, type GameSocket } from './socket';

const onlineList = () => [...hub.online.values()].map(({ id, username, activity }) => ({ id, username, activity }));

export function setupRealtime(io: Server) {
  hub.io = io;
  startCrash(io);
  startRoulette(io);
  startWheel(io);
  startRace(io);
  const handlers = [registerCrash, registerRoulette, registerCoinflip, registerSlots, registerMines, registerDice, registerPlinko, registerHilo, registerWheel, registerJackpot, registerRace, registerDm, registerBlackjack(io), registerPoker(io)];

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
      if (text.startsWith('/tip')) return tip(user.id, user.username, text);
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
        title: shopItem(u.title)?.name ?? null,
        effect: u.nameEffect,
        at: Date.now(),
      };
      hub.chat = [...hub.chat.slice(-49), msg];
      hub.chatActive.set(u.id, msg.at);
      io.emit('chat', msg);
    });

    // Names for chat autocomplete: the user's friends (online players come from the presence list).
    handle(socket, 'chat:names', empty, async () => {
      const links = await db.friendship.findMany({
        where: { accepted: true, OR: [{ fromId: user.id }, { toId: user.id }] },
        select: { from: { select: { username: true } }, to: { select: { username: true } } },
      });
      return { names: links.map((l) => (l.from.username === user.username ? l.to.username : l.from.username)) };
    });

    for (const register of handlers) register(io, socket);

    socket.on('disconnect', () => {
      if (--entry.sockets <= 0) hub.online.delete(user.id);
      io.emit('online', onlineList());
    });
  });
}

/** Shutdown: closes all sockets first (no new actions), then returns every open stake once. */
export async function closeAndRefund() {
  await new Promise<void>((resolve) => (hub.io ? hub.io.close(() => resolve()) : resolve()));
  await settleInflight();
  for (const refund of [refundCrash, refundRoulette, refundCoinflip, refundMines, refundHilo, refundWheel, refundJackpot, refundRace, refundBlackjack, refundPoker]) await refund();
}

/** Chat command `/tip Name 100`: gives NVC to another player and announces it. */
async function tip(fromId: string, fromName: string, text: string) {
  const [, name, raw] = text.split(/\s+/);
  const amount = Number(raw);
  if (!name || !raw) throw new UserError('So geht’s: /tip Name Betrag');
  assertAmount(amount);
  const to = await db.user.findUnique({ where: { username: name.replace(/^@/, '') }, select: { id: true, username: true } });
  if (!to) throw new UserError('Spieler nicht gefunden.');
  if (to.id === fromId) throw new UserError('Du kannst dir nicht selbst Trinkgeld geben.');
  if (hub.maintenance.on) throw new UserError('Wartungsmodus aktiv.');
  // Same rules as sending money: friends only, and never past a block.
  const pair = [{ fromId, toId: to.id }, { fromId: to.id, toId: fromId }];
  if (await db.block.count({ where: { OR: pair } })) throw new UserError('Nicht möglich – einer von euch hat den anderen blockiert.');
  if (!(await db.friendship.count({ where: { accepted: true, OR: pair } }))) throw new UserError('Trinkgeld geht nur an Freunde.');
  await applyLedger([
    { userId: fromId, amount: -amount, kind: 'TRANSFER', counterpartyId: to.id, note: 'Trinkgeld' },
    { userId: to.id, amount, kind: 'TRANSFER', counterpartyId: fromId, note: 'Trinkgeld' },
  ]);
  systemMessage(`${fromName} gibt ${to.username} ${amount.toLocaleString('de-DE')} NVC Trinkgeld.`);
  await notify(to.id, 'Trinkgeld', `${fromName} hat dir ${amount.toLocaleString('de-DE')} NVC gegeben.`);
}
