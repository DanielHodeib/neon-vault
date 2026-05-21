# Neon Vault

Realtime casino app (Next.js + Socket.IO game server). **Production target: AWS EC2 with Docker.**

## Project layout

```
neon-vault/
├── app/                 # Next.js routes & API
├── components/          # UI (hub, games, admin)
├── game-server/         # Socket.IO backend
├── hooks/               # Client hooks (e.g. crash socket)
├── lib/                 # Shared server/client utilities
├── prisma/              # Database schema
├── public/              # Static assets (optional)
├── scripts/             # Deploy, backup, optional dev tunnel
├── docs/                # Deployment & hosting guides
├── docker-compose.deploy.yml   # AWS / production stack
└── Dockerfile.production       # App image for production
```

## AWS production (recommended)

```bash
cp .env.production.example .env.production
# edit .env.production + game-server/.env.production

npm run deploy:up
npm run deploy:logs
```

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) and [docs/DOCKER_QUICK_START.md](./docs/DOCKER_QUICK_START.md).

## Local development

```bash
npm install
cd game-server && npm install

# terminal 1
npm run dev

# terminal 2
cd game-server && npm run dev
```

Or both at once: `npm run dev:all`

## Optional: Tailscale tunnel (dev only)

Not required for AWS. See [docs/REMOTE_ACCESS.md](./docs/REMOTE_ACCESS.md).

```bash
npm run tunnel
npm run tunnel:url
npm run tunnel:stop
```

## Environment

Use `.env.example` / `.env.production.example` as templates. On AWS, set `NEXTAUTH_URL` to your public domain and route Socket.IO through nginx or expose port `5000`.
