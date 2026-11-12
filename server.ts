import { readFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';

import next from 'next';
import { Server } from 'socket.io';

import { closeAndRefund, setupRealtime } from './game';
import { startBackups } from './lib/backup';
import { startTournaments } from './lib/tournament';
import { loadMaintenance, startCountdown, startEventScheduler } from './lib/events';
import { loadBigWins } from './lib/bigwins';
import { db } from './lib/hub';

// One process serves the Next app and Socket.IO, so both share the DB client and game state.
const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 3000);

const httpServer = createServer();
const app = next({ dev, port, httpServer });
const handleRequest = app.getRequestHandler();

async function main() {
  await app.prepare();
  await loadMaintenance();
  await loadBigWins();
  // Expired logins are useless; drop them now and once a day so the table doesn't grow forever.
  const dropExpiredSessions = () => db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(console.error);
  void dropExpiredSessions();
  setInterval(dropExpiredSessions, 86_400_000).unref();

  httpServer.on('request', (req, res) => {
    // socket.io answers its own polling requests
    if (!req.url?.startsWith('/socket.io/')) void handleRequest(req, res);
  });

  const io = new Server(httpServer, {
    destroyUpgrade: false,
    // Browsers always send Origin; only our own pages may open a socket with the session cookie.
    allowRequest: (req, done) => {
      // Must never throw: engine.io calls this without a try/catch ("Origin: null" is not a URL).
      const origin = req.headers.origin;
      done(null, !origin || URL.parse(origin)?.host === (req.headers['x-forwarded-host'] ?? req.headers.host));
    },
  });
  setupRealtime(io);
  startEventScheduler();
  startBackups();
  startTournaments();
  watchRestartRequests();
  // HOST=127.0.0.1 on a server behind Caddy keeps the port private; unset listens everywhere.
  httpServer.listen(port, process.env.HOST, () => console.log(`> Neon Vault läuft auf http://localhost:${port}`));
}

/**
 * The update script asks for a restart countdown by writing the seconds into this file;
 * a file on the server's own disk needs no password or open port.
 */
const RESTART_FILE = process.env.RESTART_FILE ?? 'restart-request';
function watchRestartRequests() {
  setInterval(async () => {
    const text = await readFile(RESTART_FILE, 'utf8').catch(() => null);
    if (text === null) return;
    await unlink(RESTART_FILE).catch(() => {});
    const seconds = Math.min(600, Math.max(5, Number.parseInt(text, 10) || 60));
    startCountdown('restart', seconds);
  }, 2000).unref();
}

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return; // a second Ctrl+C must not refund twice
  shuttingDown = true;
  console.log('> Fahre herunter, gebe offene Einsätze zurück …');
  await closeAndRefund().catch(console.error);
  await db.$disconnect();
  process.exit(0);
};
// One process serves everyone: a failed timer callback must not take the whole casino down.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

void main();
