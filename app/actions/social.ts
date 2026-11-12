'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';

import { parse, run, type ActionState } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { db, notify, UserError } from '@/lib/hub';
import { applyLedger, assertAmount } from '@/lib/wallet';

const pair = (a: string, b: string) => [
  { fromId: a, toId: b },
  { fromId: b, toId: a },
];

async function findUser(username: string) {
  const user = await db.user.findUnique({ where: { username: username.trim() } });
  if (!user) throw new UserError('Spieler nicht gefunden.');
  return user;
}

export async function sendFriendRequest(_: ActionState, form: FormData) {
  return run(async () => {
    const me = await requireUser();
    const { username } = parse(z.object({ username: z.string().min(1, 'Name fehlt.') }), form);
    const other = await findUser(username);
    if (other.id === me.id) throw new UserError('Das bist du selbst.');
    if (await db.block.count({ where: { OR: pair(me.id, other.id) } })) throw new UserError('Nicht möglich – einer von euch hat den anderen blockiert.');

    const existing = await db.friendship.findFirst({ where: { OR: pair(me.id, other.id) } });
    if (existing?.accepted) throw new UserError('Ihr seid schon befreundet.');
    if (existing?.fromId === me.id) throw new UserError('Anfrage wurde schon gesendet.');
    if (existing) {
      // They already asked us: sending back means accepting.
      await db.friendship.update({ where: { fromId_toId: { fromId: other.id, toId: me.id } }, data: { accepted: true } });
      await notify(other.id, 'Freundschaft', `${me.username} hat deine Anfrage angenommen.`, { link: `/profile/${me.username}` });
      await db.notification.updateMany({ where: { userId: me.id, friendId: other.id }, data: { friendId: null } });
      refresh();
      return `Du bist jetzt mit ${other.username} befreundet.`;
    }
    await db.friendship.create({ data: { fromId: me.id, toId: other.id } });
    await notify(other.id, 'Freundschaftsanfrage', `${me.username} möchte mit dir befreundet sein.`, { link: '/friends', friendId: me.id });
    refresh();
    return 'Anfrage gesendet.';
  });
}

export async function respondFriend(fromId: string, accept: boolean) {
  return run(async () => {
    const me = await requireUser();
    const where = { fromId, toId: me.id, accepted: false };
    // Either way the request is handled: its buttons in the notification panel go away.
    await db.notification.updateMany({ where: { userId: me.id, friendId: fromId }, data: { friendId: null } });
    refresh();
    if (!accept) {
      await db.friendship.deleteMany({ where });
      return 'Anfrage abgelehnt.';
    }
    if (!(await db.friendship.updateMany({ where, data: { accepted: true } })).count) throw new UserError('Diese Anfrage gibt es nicht mehr.');
    await notify(fromId, 'Freundschaft', `${me.username} hat deine Anfrage angenommen.`, { link: `/profile/${me.username}` });
    return 'Ihr seid jetzt befreundet.';
  });
}

export async function removeFriend(userId: string) {
  const me = await requireUser();
  await db.friendship.deleteMany({ where: { OR: pair(me.id, userId) } });
  refresh();
}

export async function setBlocked(userId: string, blocked: boolean) {
  const me = await requireUser();
  if (userId === me.id) return;
  if (blocked) {
    await db.$transaction([
      db.friendship.deleteMany({ where: { OR: pair(me.id, userId) } }),
      db.block.upsert({ where: { fromId_toId: { fromId: me.id, toId: userId } }, update: {}, create: { fromId: me.id, toId: userId } }),
    ]);
  } else await db.block.deleteMany({ where: { fromId: me.id, toId: userId } });
  refresh();
}

export async function sendMoney(_: ActionState, form: FormData) {
  return run(async () => {
    const me = await requireUser();
    const { username, amount, message } = parse(
      z.object({ username: z.string(), amount: z.coerce.number().int('Nur ganze NVC.'), message: z.string().max(120).default('') }),
      form,
    );
    assertAmount(amount);
    const other = await findUser(username);
    if (other.id === me.id) throw new UserError('Du kannst dir nicht selbst Geld senden.');
    if (!(await db.friendship.count({ where: { accepted: true, OR: pair(me.id, other.id) } }))) throw new UserError('Nur an Freunde.');
    await applyLedger([
      { userId: me.id, amount: -amount, kind: 'TRANSFER', counterpartyId: other.id, note: message },
      { userId: other.id, amount, kind: 'TRANSFER', counterpartyId: me.id, note: message },
    ]);
    await notify(other.id, 'Geld erhalten', `${me.username} hat dir ${amount.toLocaleString('de-DE')} NVC gesendet${message ? `: „${message}“` : '.'}`, { link: '/friends' });
    refresh();
    return `${amount.toLocaleString('de-DE')} NVC an ${other.username} gesendet.`;
  });
}

/** 👍 on a profile, or taking it back. */
export async function toggleLike(userId: string) {
  return run(async () => {
    const me = await requireUser();
    if (userId === me.id) throw new UserError('Dein eigenes Profil kannst du nicht liken.');
    const key = { fromId_toId: { fromId: me.id, toId: userId } };
    if (await db.profileLike.findUnique({ where: key })) await db.profileLike.delete({ where: key });
    else if (await db.user.count({ where: { id: userId } })) await db.profileLike.create({ data: { fromId: me.id, toId: userId } });
    else throw new UserError('Spieler nicht gefunden.');
    refresh();
  });
}
