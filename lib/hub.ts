import { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';

import type { EventParams, EventType } from './eventTypes';
import type { Mood } from './fx';

// server.ts (tsx) and Next's bundled code load separate copies of this module,
// so anything shared between them lives on globalThis.
export type GlobalEvent = {
  type: EventType;
  label: string;
  description: string; // German, with the event's values filled in
  params: EventParams;
  startedAt: number;
  endsAt: number;
};

/** Global countdown banner: a server restart or scheduled maintenance. */
export type Countdown = { kind: 'restart' | 'maintenance'; at: number; minutes?: number };

/** A big win for the live ticker (lib/bigwins.ts). */
export type BigWin = { id: string; username: string; game: string; amount: number; at: number };

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
  countdown: Countdown | null;
  mood: Mood | null; // atmosphere preset for everyone
  bigWins: BigWin[]; // newest first
  online: Map<string, OnlineUser>;
  chat: ChatMessage[];
  chatActive: Map<string, number>; // userId -> last message time
  muted: Map<string, number>; // userId -> chat muted until (ms)
  timers: Record<string, NodeJS.Timeout | undefined>;
  rainActive: boolean;
  autoEvents: boolean; // server starts random events by itself
  nextAutoAt: number | null;
  bountyPaid: boolean; // Bounty event pays out once
  eventBonusPaid: Map<string, number>; // boost/cashback extra per player during the running event
};

const g = globalThis as unknown as { __neonHub?: Hub };

export const hub: Hub = (g.__neonHub ??= {
  db: new PrismaClient(),
  io: null,
  event: null,
  maintenance: { on: false, endsAt: null },
  countdown: null,
  mood: null,
  bigWins: [],
  online: new Map(),
  chat: [],
  chatActive: new Map(),
  muted: new Map(),
  timers: {},
  rainActive: false,
  autoEvents: true,
  nextAutoAt: null,
  bountyPaid: false,
  eventBonusPaid: new Map(),
});

export const db = hub.db;

/** True while a chat mute is running. */
export const isMuted = (userId: string) => (hub.muted.get(userId) ?? 0) > Date.now();

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

/** `link` = page the notification opens; `friendId` = open friend request from that user. */
export async function notify(userId: string, title: string, message: string, extra: { link?: string; friendId?: string } = {}) {
  await db.notification.create({ data: { userId, title, message, ...extra } });
  emitToUser(userId, 'notification', { title, message });
}

/** Message shown to the user; anything else is logged and hidden. */
export class UserError extends Error {}

/** The atmosphere preset for everyone, unless it already ran out. */
export const currentMood = () => (hub.mood && hub.mood.endsAt > Date.now() ? hub.mood : null);
