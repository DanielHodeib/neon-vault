import 'server-only';

import type { Role } from '@prisma/client';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { db } from './hub';
import { atLeast } from './roles';
import { hashToken, newSession, SESSION_COOKIE, userFromToken } from './session';

export const getUser = cache(async () => userFromToken((await cookies()).get(SESSION_COOKIE)?.value));

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireRole(min: Role) {
  const user = await requireUser();
  if (!atLeast(user.role, min)) redirect('/');
  return user;
}

export async function startSession(userId: string) {
  const { token, expiresAt } = await newSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}
