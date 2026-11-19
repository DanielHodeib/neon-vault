import assert from 'node:assert/strict';
import test from 'node:test';

import path from 'node:path';

import { backupName, outdated } from './backup';

test('backup names are dated and safe', () => {
  assert.equal(backupName(new Date('2026-11-11T20:00:00Z')), 'neon-vault-2026-11-11.db');
});

test('only the newest snapshots are kept, other files are ignored', () => {
  const files = ['neon-vault-2026-11-01.db', 'neon-vault-2026-11-03.db', 'neon-vault-2026-11-02.db', 'notes.txt'];
  assert.deepEqual(outdated(files, 2), ['neon-vault-2026-11-01.db']);
  assert.deepEqual(outdated(files, 5), []);
});

test('offsite copy runs the configured command with BACKUP_DIR and does nothing when unset', async () => {
  const { mkdtemp, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { offsiteCopy } = await import('./backup');
  const dir = await mkdtemp(path.join(tmpdir(), 'nv-offsite-'));
  delete process.env.OFFSITE_BACKUP_CMD;
  await offsiteCopy(); // no command: no error
  process.env.BACKUP_DIR = dir;
  process.env.OFFSITE_BACKUP_CMD = 'echo done > "$BACKUP_DIR/marker.txt"';
  await offsiteCopy();
  assert.equal((await readFile(path.join(dir, 'marker.txt'), 'utf8')).trim(), 'done');
  delete process.env.OFFSITE_BACKUP_CMD;
  delete process.env.BACKUP_DIR;
});
