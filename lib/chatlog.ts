import { db } from './hub';

/** Chat history that survives restarts: one row per message, the last `keep` per channel. */
export async function saveChat(channel: string, message: object, keep: number) {
  await db.chatLog.create({ data: { channel, data: JSON.stringify(message) } });
  const old = await db.chatLog.findMany({ where: { channel }, orderBy: [{ at: 'desc' }, { id: 'desc' }], skip: keep, select: { id: true } });
  if (old.length) await db.chatLog.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
}

/** Oldest first, ready to show. */
export async function loadChat<T>(channel: string, keep: number): Promise<T[]> {
  const rows = await db.chatLog.findMany({ where: { channel }, orderBy: [{ at: 'desc' }, { id: 'desc' }], take: keep });
  return rows.reverse().map((r) => JSON.parse(r.data) as T);
}

export const dropChat = (channel: string) => db.chatLog.deleteMany({ where: { channel } });
