# Neon Vault — Documentation

| Guide | Purpose |
|-------|---------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | AWS / production deployment |
| [DOCKER_QUICK_START.md](./DOCKER_QUICK_START.md) | Docker Compose quick start |
| [HOSTING.md](./HOSTING.md) | Hosting overview |
| [REMOTE_ACCESS.md](./REMOTE_ACCESS.md) | Optional Tailscale tunnel (local dev only) |

Production deploy on AWS:

```bash
docker compose -f docker-compose.deploy.yml up -d --build
```
