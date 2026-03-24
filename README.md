# Neon Vault

Realtime casino app with auth, friends, and multiplayer rooms.

## Local Development

Install dependencies:

```bash
npm install
cd game-server && npm install
```

Run app + socket server:

```bash
# terminal 1
npm run dev

# terminal 2
npm run dev:game-server
```

## Play From Other Laptops (LAN)

1. Find your local IP:

```bash
ipconfig getifaddr en0
```

2. Update root `.env`:

```env
NEXTAUTH_URL="http://YOUR_IP:3000"
NEXT_PUBLIC_GAME_SERVER_URL="http://YOUR_IP:4001"
```

3. Start both services with LAN host binding:

```bash
# terminal 1
npm run dev:lan

# terminal 2
npm run dev:game-server:lan
```

4. Open firewall for ports `3000` and `4001` if macOS prompts.

5. Friends open `http://YOUR_IP:3000`, register/login, then join your room id (Crash/Poker/Blackjack).
6. In Poker/Blackjack, friends only need the room id string (for example `bj-ab123`) in the room input, then click `Join Room`.

## Multiplayer Notes

- Crash: room join/create + live room member list.
- Poker: `Solo + Bots` mode and `Friends Room` mode.
- Blackjack: `Solo + Bots` mode and `Friends Room` mode with dealer/player table seats.

## Production Deployment (Docker)

This repository includes a full deployment setup for:

- Next.js app (`3000`)
- Socket game server (`4001`)
- Persistent Prisma SQLite database volume

### 1) Prepare env files

Create production env files from templates:

```bash
cp .env.production.example .env.production
cp game-server/.env.production.example game-server/.env.production
```

Edit `.env.production`:

```env
DATABASE_URL="file:/app/prisma/prod.db"
NEXTAUTH_SECRET="your-long-random-secret"
NEXTAUTH_URL="https://your-domain.com"
NEXT_PUBLIC_GAME_SERVER_URL="https://your-domain.com:4001"
```

Edit `game-server/.env.production`:

```env
HOST=0.0.0.0
PORT=4001
CLIENT_ORIGIN=https://your-domain.com
CLIENT_ORIGINS=https://your-domain.com
```

### 2) Build and start

```bash
npm run deploy:up
```

### 3) Watch logs

```bash
npm run deploy:logs
```

### 4) Stop deployment

```bash
npm run deploy:down
```

### Notes

- Open inbound ports `3000` and `4001` on your host/firewall.
- For public internet deployment, place a reverse proxy in front (for HTTPS and domain routing).
- Prisma data is persisted in the Docker volume `prisma_data`.
