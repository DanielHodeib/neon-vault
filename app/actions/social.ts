'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';

import { parse, run, type ActionState } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import * as friends from '@/lib/friendService';
import { db } from '@/lib/hub';

// Thin wrappers: who is asking (cookie), form parsing and the page refresh live here, the rules in lib/friendService.ts.

export async function sendFriendRequest(_: ActionState, form: FormData) {
  return run(async () => {
    const me = await requireUser();
    const { username } = parse(z.object({ username: z.string().min(1, 'Name fehlt.') }), form);
    const msg = await friends.sendFriendRequest(me, username);
    refresh();
    return msg;
  });
}

export async function respondFriend(fromId: string, accept: boolean) {
  return run(async () => {
    const msg = await friends.respondFriend(await requireUser(), fromId, accept);
    refresh();
    return msg;
  });
}

export async function removeFriend(userId: string) {
  await friends.removeFriend((await requireUser()).id, userId);
  refresh();
}

export async function setBlocked(userId: string, blocked: boolean) {
  await friends.setBlocked((await requireUser()).id, userId, blocked);
  refresh();
}

export async function sendMoney(_: ActionState, form: FormData) {
  return run(async () => {
    const me = await requireUser();
    const { username, amount, message } = parse(
      z.object({ username: z.string(), amount: z.coerce.number().int('Nur ganze NVC.'), message: z.string().max(120).default('') }),
      form,
    );
    const msg = await friends.sendMoney(me, username, amount, message);
    refresh();
    return msg;
  });
}

export async function toggleLike(userId: string) {
  return run(async () => {
    await friends.toggleLike((await requireUser()).id, userId);
    refresh();
  });
}

/** Player names for the quick search (Ctrl+K): prefix match, public profiles only, at most 6. */
export async function searchPlayers(query: string) {
  await requireUser();
  const q = query.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  if (q.length < 2) return [];
  const users = await db.user.findMany({ where: { username: { startsWith: q }, publicProfile: true }, select: { username: true }, take: 6, orderBy: { username: 'asc' } });
  return users.map((u) => u.username);
}
