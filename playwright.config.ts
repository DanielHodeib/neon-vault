import { defineConfig, devices } from '@playwright/test';

// Click tests: a fresh server with an empty database (prisma/e2e.db) on port 3200.
// Run with `npm run e2e` (first time: `npx playwright install chromium`).
const PORT = 3200;
const env = 'DATABASE_URL="file:./e2e.db?connection_limit=1" BACKUP_DIR=prisma/e2e-backups NEXT_DIST_DIR=.next-e2e';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000, // the dev server compiles every page on its first visit
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1, // one shared server and database; tests run in order
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', locale: 'de-DE' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `rm -f prisma/e2e.db prisma/e2e.db-journal && ${env} npx prisma migrate deploy && ${env} PORT=${PORT} npx tsx server.ts`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
