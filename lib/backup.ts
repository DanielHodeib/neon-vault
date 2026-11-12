import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { db } from './hub';

// Daily copy of the SQLite database. VACUUM INTO writes a consistent snapshot
// while the server keeps running. Folder via BACKUP_DIR, default ./backups.
const KEEP = 14;
const DAY = 86_400_000;
export const backupDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.BACKUP_DIR ?? 'backups');

/** Name for a day's snapshot; only digits and dashes, so it is safe inside the SQL string. */
export const backupName = (d = new Date()) => `neon-vault-${d.toISOString().slice(0, 10)}.db`;

/** Snapshots to delete: everything but the newest `keep` (names sort by date). */
export const outdated = (files: string[], keep = KEEP) =>
  files.filter((f) => /^neon-vault-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(keep);

/** `force` replaces today's snapshot (manual backup from the admin page). */
export async function backupNow({ force = false } = {}) {
  const dir = backupDir();
  await mkdir(/*turbopackIgnore: true*/ dir, { recursive: true }); // runtime folder, not part of the build
  const files = await readdir(/*turbopackIgnore: true*/ dir);
  const name = backupName();
  if (force && files.includes(name)) await rm(/*turbopackIgnore: true*/ path.join(dir, name), { force: true });
  if (force || !files.includes(name)) {
    await db.$executeRawUnsafe(`VACUUM INTO '${path.join(dir, name).replaceAll("'", "''")}'`);
    console.log(`> Backup gespeichert: ${path.join(dir, name)}`);
  }
  for (const old of outdated([...files, name])) await rm(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, old), { force: true });
}

/** Backup at start, then once a day. */
export function startBackups() {
  const run = () => void backupNow().catch((err) => console.error('[backup]', err));
  run();
  setInterval(run, DAY).unref();
}
