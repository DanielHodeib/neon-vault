import assert from 'node:assert/strict';
import test from 'node:test';

import { backupName, outdated } from './backup';

test('backup names are dated and safe', () => {
  assert.equal(backupName(new Date('2026-11-11T20:00:00Z')), 'neon-vault-2026-11-11.db');
});

test('only the newest snapshots are kept, other files are ignored', () => {
  const files = ['neon-vault-2026-11-01.db', 'neon-vault-2026-11-03.db', 'neon-vault-2026-11-02.db', 'notes.txt'];
  assert.deepEqual(outdated(files, 2), ['neon-vault-2026-11-01.db']);
  assert.deepEqual(outdated(files, 5), []);
});
