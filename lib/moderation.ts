import { db, hub } from './hub';
import { applyLedger } from './wallet';

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

/** Sets a balance to an exact amount (an ADMIN ledger entry for the difference). Returns the change. */
export async function setBalanceTo(userId: string, target: number, note: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } });
  const delta = target - Number(user.balance);
  if (delta !== 0) await applyLedger([{ userId, amount: delta, kind: 'ADMIN', note }]);
  return delta;
}
