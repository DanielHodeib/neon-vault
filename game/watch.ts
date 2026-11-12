import { z } from 'zod';

import { REACTIONS } from '@/lib/games';
import { db, emitToUser, hub, UserError } from '@/lib/hub';
import { empty, handle, onAfterEvent, type GameSocket, type Register } from './socket';

// Watching friends: finished rounds of a player go to the room `watch:<userId>`, friends only.

/** Socket events whose reply is a finished round, and the game they belong to. */
const ROUND_EVENTS: Record<string, string> = {
  'slots:spin': 'slots',
  'dice:roll': 'dice',
  'plinko:drop': 'plinko',
  'coinflip:solo': 'coinflip',
  'mines:cashout': 'mines',
  'mines:reveal': 'mines',
  'hilo:cashout': 'hilo',
  'hilo:guess': 'hilo',
  'tower:cashout': 'tower',
  'tower:pick': 'tower',
  'scratch:buy': 'scratch',
  'keno:play': 'keno',
  'vpoker:draw': 'vpoker',
  'limbo:play': 'limbo',
  'baccarat:play': 'baccarat',
  'crash:cashout': 'crash',
};

export type WatchedRound = { id: string; game: string; bet: number | null; won: number; multiplier: number | null; detail: string; lost: boolean; at: number };

const room = (userId: string) => `watch:${userId}`;
const viewers = (userId: string) => hub.io?.sockets.adapter.rooms.get(room(userId))?.size ?? 0;
let seq = 0;

/** A short line for the feed, picked from whatever the game replied. */
function describe(game: string, data: Record<string, unknown>, res: Record<string, unknown>): Omit<WatchedRound, 'id' | 'at'> | null {
  const n = (v: unknown) => (typeof v === 'number' ? v : null);
  const won = n(res.payout) ?? n(res.win) ?? 0;
  const bet = n(data.amount) ?? n(res.bet);
  const multiplier = n(res.multiplier) ?? null;
  let detail = '';
  if (game === 'slots') {
    const grid = (res.steps as { grid: string[][] }[] | undefined)?.[0]?.grid;
    detail = grid ? grid.map((col) => col[Math.floor(col.length / 2)]).join('') : '';
  } else if (game === 'dice') detail = `${n(res.roll)?.toFixed(2)} ${data.side === 'under' ? '<' : '>'} ${data.target}`;
  else if (game === 'limbo') detail = `${n(res.result)?.toFixed(2)}× / ${t2(n(res.target))}`;
  else if (game === 'keno') detail = `${res.hits} Treffer`;
  else if (game === 'baccarat') detail = `${res.playerTotal}:${res.bankerTotal}`;
  else if (game === 'coinflip') detail = res.result === 'heads' ? 'Kopf' : 'Zahl';
  else if (game === 'mines' || game === 'tower') {
    // Single picks only matter when they end the round.
    if (res.bomb === false || res.trap === false) return res.done ? { game, bet, won, multiplier, detail: 'ganz oben!', lost: false } : null;
    detail = res.bomb || res.trap ? '💥' : '';
  } else if (game === 'hilo') {
    if (res.win === true) return null; // still climbing
    detail = typeof res.card === 'string' ? res.card : '';
  }
  return { game, bet, won, multiplier, detail, lost: won === 0 };
}
const t2 = (x: number | null) => (x === null ? '' : `${x}×`);

/** Called by handle() after every successful socket event. */
export function reportRound(socket: GameSocket, event: string, data: unknown, res: unknown) {
  const game = ROUND_EVENTS[event];
  if (!game || !res || typeof res !== 'object') return;
  const userId = socket.data.user.id;
  if (!viewers(userId)) return;
  const round = describe(game, (data ?? {}) as Record<string, unknown>, res as Record<string, unknown>);
  if (!round) return;
  socket.nsp.to(room(userId)).emit('watch:round', { ...round, id: `${Date.now()}-${seq++}`, at: Date.now() } satisfies WatchedRound);
}

onAfterEvent(reportRound);

export const registerWatch: Register = (_io, socket) => {
  const { user } = socket.data;
  let lastCheer = 0;

  handle(socket, 'watch:join', z.object({ username: z.string().max(20) }), async ({ username }) => {
    const target = await db.user.findUnique({ where: { username }, select: { id: true, username: true } });
    if (!target || target.id === user.id) throw new UserError('Spieler nicht gefunden.');
    const friends = await db.friendship.count({ where: { accepted: true, OR: [{ fromId: user.id, toId: target.id }, { fromId: target.id, toId: user.id }] } });
    if (!friends) throw new UserError('Zuschauen geht nur bei Freunden.');
    for (const r of socket.rooms) if (r.startsWith('watch:') && r !== room(target.id)) await leave(socket, r.slice(6));
    await socket.join(room(target.id));
    emitToUser(target.id, 'watchers', { count: viewers(target.id), joined: user.username });
    return { activity: hub.online.get(target.id)?.activity ?? null };
  });

  handle(socket, 'watch:leave', empty, async () => {
    for (const r of [...socket.rooms]) if (r.startsWith('watch:')) await leave(socket, r.slice(6));
  });

  // Cheer the player you watch with an emoji.
  handle(socket, 'watch:cheer', z.object({ emoji: z.enum(REACTIONS) }), ({ emoji }) => {
    const r = [...socket.rooms].find((x) => x.startsWith('watch:'));
    if (!r || Date.now() - lastCheer < 1200) return;
    lastCheer = Date.now();
    emitToUser(r.slice(6), 'cheer', { from: user.username, emoji });
  });

  socket.on('disconnecting', () => {
    for (const r of socket.rooms) if (r.startsWith('watch:')) emitToUser(r.slice(6), 'watchers', { count: Math.max(0, viewers(r.slice(6)) - 1) });
  });
};

async function leave(socket: GameSocket, targetId: string) {
  await socket.leave(room(targetId));
  emitToUser(targetId, 'watchers', { count: viewers(targetId) });
}
