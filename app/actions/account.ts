'use server';

import bcrypt from 'bcryptjs';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { parse, passwordSchema, run, type ActionState } from '@/lib/action';
import { endSession, requireUser, startSession } from '@/lib/auth';
import { db, disconnectUser, UserError } from '@/lib/hub';
import { spinDaily } from '@/lib/daily';
import { claimQuest } from '@/lib/quests';
import { THEMES } from '@/lib/format';
import { IMAGE_URL } from '@/lib/media';
import { RANKS, rankAllowed } from '@/lib/ranks';

const optionalUrl = z.union([z.literal(''), z.string().trim().max(500).regex(IMAGE_URL, 'Bild-URL muss mit https:// beginnen.')]);
const checkbox = z.literal('on').optional().transform(Boolean);

export async function updateProfile(_: ActionState, form: FormData) {
  return run(async () => {
    const user = await requireUser();
    const data = parse(
      z.object({
        avatarUrl: optionalUrl,
        bannerUrl: optionalUrl,
        bio: z.string().max(240),
        clanTag: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{0,5}$/, 'Clan-Tag: bis zu 5 Buchstaben/Zahlen.'),
        chatColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        rankTag: z.string(),
      }),
      form,
    );
    const ownerFriend = (await db.friendship.count({
      where: { accepted: true, OR: [{ fromId: user.id, to: { role: 'OWNER' } }, { toId: user.id, from: { role: 'OWNER' } }] },
    })) > 0;
    const rank = RANKS.find((r) => r.tag === data.rankTag);
    if (!rank || !rankAllowed(rank, user.xp, Number(user.balance), ownerFriend)) throw new UserError('Diesen Rang hast du noch nicht freigeschaltet.');
    await db.user.update({
      where: { id: user.id },
      data: { ...data, avatarUrl: data.avatarUrl || null, bannerUrl: data.bannerUrl || null, clanTag: data.clanTag || null },
    });
    // Drop uploads the profile no longer points at.
    const keep = [data.avatarUrl, data.bannerUrl].filter((u) => u.startsWith('/media/')).map((u) => u.slice('/media/'.length));
    await db.media.deleteMany({ where: { userId: user.id, id: { notIn: keep } } });
    refresh();
    return 'Profil gespeichert.';
  });
}

export async function updateSettings(_: ActionState, form: FormData) {
  return run(async () => {
    const user = await requireUser();
    const data = parse(
      z.object({ theme: z.enum(THEMES), soundEnabled: checkbox, publicProfile: checkbox, showBalance: checkbox, showHistory: checkbox }),
      form,
    );
    await db.user.update({ where: { id: user.id }, data });
    refresh();
    return 'Einstellungen gespeichert.';
  });
}

export async function changePassword(_: ActionState, form: FormData) {
  return run(async () => {
    const user = await requireUser();
    const { current, next } = parse(z.object({ current: z.string(), next: passwordSchema }), form);
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new UserError('Aktuelles Passwort ist falsch.');
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10), sessions: { deleteMany: {} } } });
    disconnectUser(user.id);
    await startSession(user.id); // every other device is signed out, this one stays in
    return 'Passwort geändert. Andere Geräte wurden abgemeldet.';
  });
}

export async function deleteAccount(_: ActionState, form: FormData) {
  const result = await run(async () => {
    const user = await requireUser();
    const { password } = parse(z.object({ password: z.string() }), form);
    if (!(await bcrypt.compare(password, user.passwordHash))) throw new UserError('Passwort ist falsch.');
    await endSession();
    await db.user.delete({ where: { id: user.id } });
    disconnectUser(user.id);
  });
  if (result?.error) return result;
  redirect('/register');
}

/** Returns the winning segment so the client can animate the wheel before refreshing. */
export async function dailySpinAction() {
  try {
    const user = await requireUser();
    return { ok: true as const, ...(await spinDaily(user.id)) };
  } catch (err) {
    if (err instanceof UserError) return { ok: false as const, error: err.message };
    throw err;
  }
}

export async function claimQuestAction(key: string) {
  return run(async () => {
    const user = await requireUser();
    await claimQuest(user.id, key);
    refresh();
    return 'Belohnung abgeholt!';
  });
}

export async function readNotifications() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
  refresh();
}

export async function clearNotifications() {
  const user = await requireUser();
  await db.notification.deleteMany({ where: { userId: user.id } });
  refresh();
}
