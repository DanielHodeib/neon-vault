import { createHash, randomBytes } from 'node:crypto';

import { db } from './hub';

// Framework-free session logic, shared by Next (lib/auth.ts) and the socket server.
// __Host- binds the cookie to this exact host over HTTPS; plain http (local dev) can't use the prefix.
export const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-nv_session' : 'nv_session';
export const SESSION_DAYS = 30;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function newSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export const isBanned = (u: { bannedUntil: Date | null }) => !!u.bannedUntil && u.bannedUntil.getTime() > Date.now();

/** The logged-in, non-banned user for a cookie token, or null. */
export async function userFromToken(token: string | undefined) {
  if (!token) return null;
  const session = await db.session.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt.getTime() < Date.now() || isBanned(session.user)) return null;
  return session.user;
}

export function readCookie(header: string | undefined, name: string) {
  const match = header?.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}
