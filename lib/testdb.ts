import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Points DATABASE_URL at a fresh migrated SQLite file. Call it before the first import of lib/hub. */
export function useTempDb() {
  const file = join(mkdtempSync(join(tmpdir(), 'nv-test-')), 'test.db');
  process.env.DATABASE_URL = `file:${file}?connection_limit=1`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
}
