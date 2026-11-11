'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { parse, passwordSchema, rateLimit, run, usernameSchema, type ActionState } from '@/lib/action';
import { endSession, startSession } from '@/lib/auth';
import { db, UserError } from '@/lib/hub';
import { isBanned } from '@/lib/session';

export async function register(_: ActionState, form: FormData) {
  const result = await run(async () => {
    await rateLimit('register', 5, 60 * 60_000);
    const { username, password, confirm } = parse(z.object({ username: usernameSchema, password: passwordSchema, confirm: z.string() }), form);
    if (password !== confirm) throw new UserError('Passwörter stimmen nicht überein.');
    if (await db.user.findUnique({ where: { username } })) throw new UserError('Benutzername ist vergeben.');
    const user = await db.user.create({ data: { username, passwordHash: await bcrypt.hash(password, 10) } });
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
