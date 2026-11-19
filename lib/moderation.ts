import { db, hub } from './hub';

/** Chat mute for `minutes` (0 = lift). Saved in the database so a restart does not free anyone. */
export async function setMute(userId: string, minutes: number) {
  const until = minutes > 0 ? new Date(Date.now() + minutes * 60_000) : null;
  await db.user.update({ where: { id: userId }, data: { mutedUntil: until } });
  if (until) hub.muted.set(userId, until.getTime());
  else hub.muted.delete(userId);
}

/** Server start: bring running mutes back into memory. */
export async function loadMutes() {
  const users = await db.user.findMany({ where: { mutedUntil: { gt: new Date() } }, select: { id: true, mutedUntil: true } });
  for (const u of users) hub.muted.set(u.id, u.mutedUntil!.getTime());
}
