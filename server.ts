import { createServer } from 'node:http';

import next from 'next';
import { Server } from 'socket.io';

import { setupRealtime } from './game';
import { refundPokerStacks } from './game/poker';
import { loadMaintenance, startEventScheduler } from './lib/events';
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

  httpServer.on('request', (req, res) => {
    // socket.io answers its own polling requests
    if (!req.url?.startsWith('/socket.io/')) void handleRequest(req, res);
  });

  setupRealtime(new Server(httpServer, { destroyUpgrade: false }));
  startEventScheduler();
  httpServer.listen(port, () => console.log(`> Neon Vault läuft auf http://localhost:${port}`));
}

const shutdown = async () => {
  console.log('> Fahre herunter, gebe Poker-Stacks zurück …');
  await refundPokerStacks().catch(console.error);
  await db.$disconnect();
  process.exit(0);
};
// One process serves everyone: a failed timer callback must not take the whole casino down.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

void main();
