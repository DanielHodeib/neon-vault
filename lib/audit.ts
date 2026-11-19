import { db } from './hub';

/** Writes one line into the admin log. Never throws: a failed log must not undo the action. */
export async function audit(actor: { id: string; username: string }, action: string, target?: { username: string } | null, detail?: string) {
  await db.auditLog
    .create({ data: { actorId: actor.id, actorName: actor.username, action, targetName: target?.username ?? null, detail: detail ?? null } })
    .catch((err) => console.error('[audit]', err));
}
