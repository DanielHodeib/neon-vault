import { z } from 'zod';

import { db, hub, UserError } from '@/lib/hub';
import { empty, handle, type Register } from './socket';

// Private chat of a clan: the last messages live in memory, the socket room is `clan:<id>`.
export type ClanMsg = { id: string; userId: string; username: string; text: string; at: number };
const KEEP = 60;
// On globalThis: server actions (Next's bundle) and the socket server must see the same map.
const g = globalThis as typeof globalThis & { __clanChat?: Map<string, ClanMsg[]> };
const history = (g.__clanChat ??= new Map<string, ClanMsg[]>());
let seq = 0;

/** Takes a player's sockets out of a clan's room (kicked, left, clan disbanded). */
export function leaveClanRoom(userId: string, clanId: string) {
  hub.io?.in(`user:${userId}`).socketsLeave(`clan:${clanId}`);
}
export const dropClanHistory = (clanId: string) => void history.delete(clanId);

export const registerClanChat: Register = (_io, socket) => {
  const { user } = socket.data;
  const clanOf = async () => {
    const u = await db.user.findUnique({ where: { id: user.id }, select: { clanId: true } });
    if (!u?.clanId) throw new UserError('Du bist in keinem Clan.');
    return u.clanId;
  };

  handle(socket, 'clan:join', empty, async () => {
    const clanId = await clanOf();
    for (const r of socket.rooms) if (r.startsWith('clan:') && r !== `clan:${clanId}`) await socket.leave(r);
    await socket.join(`clan:${clanId}`);
    return { messages: history.get(clanId) ?? [] };
  });

  handle(socket, 'clan:send', z.object({ text: z.string().trim().min(1).max(300) }), async ({ text }) => {
    const clanId = await clanOf();
    if (hub.muted.has(user.id) && hub.muted.get(user.id)! > Date.now()) throw new UserError('Du bist stummgeschaltet.');
    const msg: ClanMsg = { id: `${Date.now()}-${seq++}`, userId: user.id, username: user.username, text, at: Date.now() };
    history.set(clanId, [...(history.get(clanId) ?? []), msg].slice(-KEEP));
    socket.nsp.to(`clan:${clanId}`).emit('clan:msg', msg);
    return {};
  });
};
