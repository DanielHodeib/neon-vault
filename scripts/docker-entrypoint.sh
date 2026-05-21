#!/bin/sh
# Docker entrypoint script for Next.js application
# Handles database migrations and starts the application in standalone mode

set -e

echo "[entrypoint] Starting Neon Vault application..."

# Run database migrations (Ohne das blockierende generate!)
echo "[entrypoint] Running database migrations..."
npx prisma migrate deploy || {
    echo "[entrypoint] Migrate deploy failed, attempting db push..."
    npx prisma db push --skip-generate
}

# Start the Next.js application (Direkt mit Node für Standalone)
echo "[entrypoint] Starting Next.js server in standalone mode..."
exec node server.js