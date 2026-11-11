import { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';

// server.ts (tsx) and Next's bundled code load separate copies of this module,
// so anything shared between them lives on globalThis.
export type GlobalEvent = {
  type: 'CASHBACK' | 'BOOST' | 'RAIN' | 'HAPPY_HOUR' | 'JACKPOT_RUSH' | 'DUEL' | 'KING' | 'BOUNTY';
  label: string;
  description: string;
  startedAt: number;
  endsAt: number;
};

export type OnlineUser = { id: string; username: string; activity: string; sockets: number };

export type ChatMessage = {
  id: string;
  userId: string | null; // null = system
  username: string;
  text: string;
  role?: string;
  rank?: { tag: string; color: string };
  clanTag?: string | null;
  color?: string | null;
  title?: string | null; // bought chat title
  effect?: string | null; // bought name effect (lib/shop.ts id)
  at: number;
};

type Hub = {
  db: PrismaClient;
  io: Server | null;
  event: GlobalEvent | null;
  maintenance: { on: boolean; endsAt: number | null };
  online: Map<string, OnlineUser>;
  chat: ChatMessage[];
  chatActive: Map<string, number>; // userId -> last message time
  timers: Record<string, NodeJS.Timeout | undefined>;
  rainActive: boolean;
  bountyPaid: boolean; // Bounty event pays out once
};

const g = globalThis as unknown as { __neonHub?: Hub };

export const hub: Hub = (g.__neonHub ??= {
  db: new PrismaClient(),
  io: null,
  event: null,
  maintenance: { on: false, endsAt: null },
  online: new Map(),
  chat: [],
  chatActive: new Map(),
  timers: {},
  rainActive: false,
  bountyPaid: false,
});

export const db = hub.db;

export function emitToUser(userId: string, event: string, data: unknown) {
  hub.io?.to(`user:${userId}`).emit(event, data);
}

/** Kicks every socket of a user, e.g. after a ban or account deletion. */
export function disconnectUser(userId: string) {
  hub.io?.in(`user:${userId}`).disconnectSockets(true);
}

export function broadcast(event: string, data: unknown) {
  hub.io?.emit(event, data);
}

export async function notify(userId: string, title: string, message: string) {
  await db.notification.create({ data: { userId, title, message } });
  emitToUser(userId, 'notification', { title, message });
}

/** Message shown to the user; anything else is logged and hidden. */
export class UserError extends Error {}
