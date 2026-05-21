# Docker Deployment Guide - Neon Vault Casino

## Overview

This guide explains the production-ready Docker setup for Neon Vault. The configuration is optimized for Linux containers (AWS EC2, DigitalOcean, etc.) with persistent data storage and proper networking.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Docker Host (Linux)                   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Docker Bridge Network (neon-network)     │   │
│  │                                                   │   │
│  │  ┌──────────────────┐      ┌──────────────────┐  │   │
│  │  │   neon-vault-app │      │neon-vault-game-  │  │   │
│  │  │   (Next.js 3000) │◄────►│   server (5000)  │  │   │
│  │  │                  │      │   (Socket.IO)    │  │   │
│  │  └────────┬─────────┘      └──────────────────┘  │   │
│  │           │                                       │   │
│  │  ┌────────▼──────────┐                            │   │
│  │  │ Named Volume      │                            │   │
│  │  │ db_data/dev.db    │                            │   │
│  │  │ (SQLite Persistent)                            │   │
│  │  └───────────────────┘                            │   │
│  └──────────────────────────────────────────────────┘   │
│           ▲              ▲                                │
│           │              │                                │
├───────────┼──────────────┼────────────────────────────┤
│  Host Ports                │              │                │
│    3000 ◄─────────────────┘              │                │
│    5000 ◄──────────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
         │                              │
         │ (Reverse Proxy)              │ (Direct)
         │ Nginx/Cloudflare             │
         ▼                              ▼
  https://daniel-hodeib-vault.chickenkiller.com
```

---

## Files Overview

### 1. **Dockerfile.production** (Next.js)
- **Multi-stage build**: Dependencies → Builder → Runtime
- **Optimizations**: Alpine Linux, production dependencies only
- **Build Args**: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL` baked at build time
- **Health Check**: Checks `/api/public/health` endpoint
- **Entrypoint**: Runs database migrations automatically

### 2. **game-server/Dockerfile.production** (Game Server)
- **Multi-stage build**: Dependencies → Runtime
- **Lightweight**: ~200MB image size
- **Health Check**: Checks `/health` endpoint
- **No external dependencies**: Pure Node.js + Express + Socket.IO

### 3. **docker-compose.deploy.yml**
- **Services**: `app` (Next.js) and `game-server` (Socket.IO backend)
- **Named Volumes**: `db_data` for SQLite persistence
- **Networking**: Internal bridge network for service communication
- **Health Checks**: Automatic service recovery
- **Resource Limits**: CPU/Memory constraints for stability

### 4. **.env.production**
- **Build-time variables**: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`
- **Runtime variables**: Database URL, authentication secrets
- **Documentation**: Comprehensive comments for each setting

### 5. **game-server/.env.production**
- **Server config**: PORT, HOST, CORS settings
- **CORS_ORIGIN**: Restricts WebSocket connections to your domain
- **APP_INTERNAL_URL**: Internal communication with Next.js API

### 6. **scripts/docker-entrypoint.sh**
- **Automatic migrations**: Runs `prisma migrate deploy` on startup
- **Fallback**: Uses `prisma db push` if migrate fails
- **Error handling**: Proper exit codes for Docker health checks

### 7. **next.config.ts** (Updated)
- **Dev vs Production**: Separate config for each environment
- **Socket.IO Rewrites**: Only in development
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, etc.
- **Source Maps**: Disabled in production for security

---

## Deployment Steps

### Prerequisites
- Docker & Docker Compose installed
- Linux host (AWS EC2, DigitalOcean, Linode, etc.)
- Domain name pointing to your host IP
- Reverse proxy configured (Nginx or Cloudflare)

### Step 1: Clone/Pull Latest Code
```bash
cd /path/to/neon-vault
git pull origin main  # or your branch
```

### Step 2: Create Environment Files

#### .env.production
```bash
cp .env.production .env.production
# Edit with your values:
nano .env.production
```

Key values to set:
```
NODE_ENV=production
NEXT_PUBLIC_API_URL=/api              # Relative path (proxied)
NEXT_PUBLIC_SOCKET_URL=https://daniel-hodeib-vault.chickenkiller.com  # Or /socket.io if proxied
NEXTAUTH_SECRET=<generate-with-crypto>
NEXTAUTH_URL=https://daniel-hodeib-vault.chickenkiller.com
```

#### game-server/.env.production
```bash
cp game-server/.env.production game-server/.env.production
nano game-server/.env.production
```

Key values:
```
NODE_ENV=production
CORS_ORIGIN=https://daniel-hodeib-vault.chickenkiller.com
```

### Step 3: Build Docker Images
```bash
# Build both services
docker-compose -f docker-compose.deploy.yml build

# Or build with custom build args
docker-compose -f docker-compose.deploy.yml build \
  --build-arg NEXT_PUBLIC_API_URL=/api \
  --build-arg NEXT_PUBLIC_SOCKET_URL=/socket.io
```

### Step 4: Start Services
```bash
# Start in background
docker-compose -f docker-compose.deploy.yml up -d

# Check logs
docker-compose -f docker-compose.deploy.yml logs -f

# Wait for migrations to complete (watch logs for success)
# Once you see "Starting Next.js server", it's ready
```

### Step 5: Verify Deployment
```bash
# Check service health
docker-compose -f docker-compose.deploy.yml ps

# Test Next.js app
curl http://localhost:3000
curl http://localhost:3000/api/public/health

# Test game server
curl http://localhost:5000/health

# Check database connection
docker exec neon-vault-app npx prisma studio
```

### Step 6: Configure Reverse Proxy

#### Nginx Configuration
```nginx
upstream next_app {
    server 127.0.0.1:3000;
}

upstream game_server {
    server 127.0.0.1:5000;
}

server {
    listen 80;
    server_name daniel-hodeib-vault.chickenkiller.com;
    
    # Redirect to HTTPS (add SSL cert with certbot)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name daniel-hodeib-vault.chickenkiller.com;
    
    ssl_certificate /etc/letsencrypt/live/daniel-hodeib-vault.chickenkiller.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/daniel-hodeib-vault.chickenkiller.com/privkey.pem;
    
    # API requests
    location /api {
        proxy_pass http://next_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Socket.IO requests
    location /socket.io {
        proxy_pass http://game_server;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Frontend static files and pages
    location / {
        proxy_pass http://next_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Troubleshooting

### Issue: API returns 404 from browser
**Cause**: Reverse proxy not routing correctly or build-time environment variables not set.

**Solution**:
```bash
# 1. Check build args were passed
docker inspect neon-vault:latest | grep -A 10 "NEXT_PUBLIC"

# 2. Check if built with correct URLs
docker exec neon-vault-app env | grep NEXT_PUBLIC

# 3. Rebuild with explicit args
docker-compose -f docker-compose.deploy.yml build \
  --build-arg NEXT_PUBLIC_API_URL=/api \
  --build-arg NEXT_PUBLIC_SOCKET_URL=/socket.io
```

### Issue: Database is empty after restart
**Cause**: Volume not properly mounted or created.

**Solution**:
```bash
# Check volume exists
docker volume ls | grep neon

# Inspect volume
docker volume inspect neon-vault_db_data

# Copy data into volume (if needed)
docker run -it --rm \
  -v neon-vault_db_data:/data \
  -v $(pwd)/prisma:/backup \
  alpine cp /backup/dev.db /data/dev.db
```

### Issue: Migrations fail on startup
**Cause**: Database locked or schema mismatch.

**Solution**:
```bash
# 1. Stop containers
docker-compose -f docker-compose.deploy.yml down

# 2. Check volume data
docker run -it --rm -v neon-vault_db_data:/data alpine ls -la /data

# 3. Clear volume (⚠️ This deletes data)
docker volume rm neon-vault_db_data

# 4. Restart (fresh migration)
docker-compose -f docker-compose.deploy.yml up -d
```

### Issue: Services can't communicate (app ↔ game-server)
**Cause**: Network isolation or DNS resolution issue.

**Solution**:
```bash
# Check network exists
docker network ls | grep neon

# Test internal connectivity
docker exec neon-vault-app curl -v http://game-server:5000/health
docker exec neon-vault-game-server curl -v http://app:3000/api/public/health
```

---

## Maintenance Commands

### View Logs
```bash
# All services
docker-compose -f docker-compose.deploy.yml logs

# Single service
docker-compose -f docker-compose.deploy.yml logs app
docker-compose -f docker-compose.deploy.yml logs game-server

# Real-time logs
docker-compose -f docker-compose.deploy.yml logs -f --tail=100
```

### Restart Services
```bash
# Restart all
docker-compose -f docker-compose.deploy.yml restart

# Restart single service
docker-compose -f docker-compose.deploy.yml restart app

# Soft restart (without losing data)
docker-compose -f docker-compose.deploy.yml up -d
```

### Update Code
```bash
# 1. Pull latest code
git pull origin main

# 2. Rebuild images
docker-compose -f docker-compose.deploy.yml build

# 3. Restart services
docker-compose -f docker-compose.deploy.yml up -d

# 4. Check logs
docker-compose -f docker-compose.deploy.yml logs -f
```

### Database Backup
```bash
# Backup SQLite database
docker run --rm \
  -v neon-vault_db_data:/data \
  alpine tar czf - -C /data . > db_backup_$(date +%Y%m%d_%H%M%S).tar.gz

# Restore from backup
docker volume rm neon-vault_db_data
docker volume create neon-vault_db_data
tar xzf db_backup_*.tar.gz | docker run --rm -i \
  -v neon-vault_db_data:/data \
  alpine tar xzf - -C /data
```

---

## Environment Variable Reference

### NEXT_PUBLIC_* (Baked at Build Time)
These are embedded in the JavaScript bundle during build. Change requires rebuilding Docker image.

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_API_URL` | `/api` | Frontend API endpoint (relative or absolute) |
| `NEXT_PUBLIC_SOCKET_URL` | `http://localhost:5000` | WebSocket server URL |

### Runtime Variables
These can be changed without rebuilding (restart container).

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `production` | Environment mode |
| `DATABASE_URL` | `file:./prisma/dev.db` | Prisma database URL |
| `NEXTAUTH_SECRET` | ⚠️ Required | Session encryption key |
| `NEXTAUTH_URL` | ⚠️ Required | Auth callback URL |

### Game Server Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `production` | Environment mode |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `5000` | Server port |
| `CORS_ORIGIN` | ⚠️ Required | WebSocket origin restriction |

---

## Security Best Practices

1. **Never commit `.env.production`** to version control
2. **Use strong `NEXTAUTH_SECRET`**: Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. **Use HTTPS only**: Configure SSL with Let's Encrypt (free)
4. **Restrict CORS_ORIGIN**: Set to your exact domain
5. **Disable source maps** in production: Already done in `next.config.ts`
6. **Limit container resources**: Resource limits prevent DOS attacks
7. **Use health checks**: Automatic recovery on service crash
8. **Backup database regularly**: SQLite files are just files, easy to backup

---

## Performance Tuning

### Increase Memory Limits
If app crashes under load:
```yaml
# In docker-compose.deploy.yml
app:
  deploy:
    resources:
      limits:
        memory: 2G
```

### Enable Caching Headers
Next.js already sets optimal cache headers for static assets (1 year).

### Monitor Container Resources
```bash
docker stats neon-vault-app neon-vault-game-server
```

---

## Development vs Production

| Aspect | Development | Production |
|--------|-------------|-----------|
| Environment File | `.env` | `.env.production` |
| Dockerfile | `Dockerfile` | `Dockerfile.production` |
| Compose File | `docker-compose.yml` | `docker-compose.deploy.yml` |
| Socket.IO Rewrite | Yes (for tunneling) | No (reverse proxy handles) |
| Build Args | Not needed | `NEXT_PUBLIC_*` vars |
| Health Checks | No | Yes |
| Resource Limits | No | Yes |
| Restart Policy | No | `unless-stopped` |

---

## Support & Debugging

For issues, check:
1. Container logs: `docker-compose -f docker-compose.deploy.yml logs`
2. Network connectivity: `docker exec neon-vault-app ping game-server`
3. Database status: `docker exec neon-vault-app npx prisma db execute --stdin < check.sql`
4. Environment vars: `docker exec neon-vault-app env | sort`
5. Health endpoints: `curl http://localhost:3000/api/public/health`

---

**Last Updated**: May 2026
**Status**: Production Ready
