'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { parse, passwordSchema, rateLimit, run, usernameSchema, type ActionState } from '@/lib/action';
import { endSession, startSession } from '@/lib/auth';
import { db, notify, UserError } from '@/lib/hub';
import { isBanned } from '@/lib/session';
import { applyLedger } from '@/lib/wallet';

const INVITE_BONUS = 2_500;

export async function register(_: ActionState, form: FormData) {
  const result = await run(async () => {
    await rateLimit('register', 5, 60 * 60_000);
    const { username, password, confirm, ref } = parse(
      z.object({ username: usernameSchema, password: passwordSchema, confirm: z.string(), ref: z.string().max(20).optional() }),
      form,
    );
    if (password !== confirm) throw new UserError('Passwörter stimmen nicht überein.');
    if (await db.user.findUnique({ where: { username } })) throw new UserError('Benutzername ist vergeben.');
    const user = await db.user.create({ data: { username, passwordHash: await bcrypt.hash(password, 10) } });
    const inviter = ref ? await db.user.findUnique({ where: { username: ref }, select: { id: true } }) : null;
    if (inviter) {
      // Invite bonus for both, and they start out as friends.
      await db.friendship.create({ data: { fromId: inviter.id, toId: user.id, accepted: true } });
      await applyLedger([
        { userId: inviter.id, amount: INVITE_BONUS, kind: 'BONUS', note: `Einladung: ${username}` },
        { userId: user.id, amount: INVITE_BONUS, kind: 'BONUS', note: 'Einladungsbonus' },
      ]);
      await notify(inviter.id, 'Einladung angenommen', `${username} ist über deinen Link dabei: +${INVITE_BONUS.toLocaleString('de-DE')} NVC.`, { link: `/profile/${username}` });
    }
    await startSession(user.id);
  });
  if (result?.error) return result;
  redirect('/');
}

export async function login(_: ActionState, form: FormData) {
  const result = await run(async () => {
    await rateLimit('login', 10, 15 * 60_000);
    const { username, password } = parse(z.object({ username: z.string().trim(), password: z.string() }), form);
    const user = await db.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new UserError('Benutzername oder Passwort falsch.');
    if (isBanned(user)) {
      const until = user.bannedUntil!.getFullYear() > 9000 ? 'dauerhaft' : `bis ${user.bannedUntil!.toLocaleString('de-DE')}`;
      throw new UserError(`Gesperrt ${until}${user.banReason ? ` – Grund: ${user.banReason}` : ''}.`);
    }
    await startSession(user.id);
  });
  if (result?.error) return result;
  redirect('/');
}

export async function logout() {
  await endSession();
  redirect('/login');
}
