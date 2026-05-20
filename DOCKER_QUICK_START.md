# Production Docker Deployment Quick Start

## 📦 What's New

This production-ready Docker setup includes:

✅ **Multi-stage builds** for minimal image size
✅ **Named volumes** for database persistence  
✅ **Health checks** for automatic recovery
✅ **Build-time env vars** properly baked into Next.js
✅ **Security headers** and production optimizations
✅ **Automatic migrations** on startup
✅ **Resource limits** to prevent resource exhaustion

## 🚀 Quick Start (5 minutes)

### 1. Create Environment Files

```bash
# Copy template and edit with your values
cp .env.production .env.production
# Edit: NEXTAUTH_SECRET, NEXTAUTH_URL, NEXT_PUBLIC_SOCKET_URL
nano .env.production

cp game-server/.env.production game-server/.env.production
nano game-server/.env.production
```

### 2. Build Images

```bash
docker-compose -f docker-compose.deploy.yml build
```

### 3. Start Services

```bash
docker-compose -f docker-compose.deploy.yml up -d

# Watch logs for successful startup
docker-compose -f docker-compose.deploy.yml logs -f
```

### 4. Test

```bash
# Test Next.js app
curl http://localhost:3000

# Test API health
curl http://localhost:3000/api/public/health

# Test game server
curl http://localhost:5000/health
```

## 📋 Files Changed/Created

| File | Purpose |
|------|---------|
| `Dockerfile.production` | **NEW** - Optimized multi-stage build for Next.js |
| `game-server/Dockerfile.production` | **NEW** - Optimized build for game server |
| `docker-compose.deploy.yml` | **UPDATED** - Uses named volumes, health checks |
| `.env.production` | **NEW** - Production environment template |
| `game-server/.env.production` | **NEW** - Game server environment template |
| `scripts/docker-entrypoint.sh` | **NEW** - Handles DB migrations on startup |
| `next.config.ts` | **UPDATED** - Production-ready config |
| `DEPLOYMENT.md` | **NEW** - Full deployment guide |

## 🔑 Key Environment Variables

### For Next.js Build
```env
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

### For Runtime
```env
NODE_ENV=production
DATABASE_URL=file:./prisma/dev.db
NEXTAUTH_SECRET=<generate-with-crypto>
NEXTAUTH_URL=https://your-domain.com
```

### For Game Server
```env
CORS_ORIGIN=https://your-domain.com
PORT=5000
HOST=0.0.0.0
```

## 🐳 Docker Compose Commands

```bash
# Build images
docker-compose -f docker-compose.deploy.yml build

# Start services
docker-compose -f docker-compose.deploy.yml up -d

# View logs
docker-compose -f docker-compose.deploy.yml logs -f

# Stop services
docker-compose -f docker-compose.deploy.yml down

# Restart services
docker-compose -f docker-compose.deploy.yml restart

# Check status
docker-compose -f docker-compose.deploy.yml ps
```

## 💾 Data Persistence

SQLite database is stored in Docker named volume `db_data`:
- Survives container restarts
- Survives image rebuilds
- Located at `/app/prisma/dev.db` inside container

View volume:
```bash
docker volume ls | grep neon
docker volume inspect neon-vault_db_data
```

## 🔄 Update Workflow

```bash
# 1. Pull new code
git pull origin main

# 2. Rebuild images
docker-compose -f docker-compose.deploy.yml build

# 3. Restart with new images
docker-compose -f docker-compose.deploy.yml up -d

# 4. Verify
docker-compose -f docker-compose.deploy.yml logs -f
```

## ❌ Troubleshooting

### API Returns 404
Check that environment variables were baked into build:
```bash
docker exec neon-vault-app env | grep NEXT_PUBLIC_API_URL
```

### Database Is Empty After Restart
Check volume:
```bash
docker run --rm -v neon-vault_db_data:/data alpine ls -la /data
```

### Services Can't Communicate
Test Docker network:
```bash
docker exec neon-vault-app curl http://game-server:5000/health
```

### Migrations Fail
Check logs:
```bash
docker-compose -f docker-compose.deploy.yml logs app | grep -i prisma
```

## 📖 Full Guide

See [DEPLOYMENT.md](DEPLOYMENT.md) for:
- Complete architecture diagram
- Detailed deployment steps
- Nginx reverse proxy configuration
- Maintenance commands
- Security best practices
- Performance tuning

## ✅ Verification Checklist

- [ ] `.env.production` created with your values
- [ ] `game-server/.env.production` created  
- [ ] Images built: `docker images | grep neon-vault`
- [ ] Services running: `docker ps | grep neon-vault`
- [ ] API health: `curl http://localhost:3000/api/public/health`
- [ ] Game server health: `curl http://localhost:5000/health`
- [ ] Database file exists: `docker volume inspect neon-vault_db_data`
- [ ] Migrations successful: `docker logs neon-vault-app | grep migrate`

---

**Ready to deploy?** Run the Quick Start commands above, then see DEPLOYMENT.md for Nginx setup.
