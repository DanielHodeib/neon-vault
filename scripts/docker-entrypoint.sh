#!/bin/sh
# Docker entrypoint script for Next.js application
# Handles database migrations and starts the application

set -e

echo "[entrypoint] Starting Neon Vault application..."

# Ensure Prisma client is generated (in case it wasn't during build)
echo "[entrypoint] Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "[entrypoint] Running database migrations..."
npx prisma migrate deploy || {
    echo "[entrypoint] Migrate deploy failed, attempting db push..."
    npx prisma db push --skip-generate
}

# Start the Next.js application
echo "[entrypoint] Starting Next.js server..."
exec npm run start -- -H 0.0.0.0 -p 3000
