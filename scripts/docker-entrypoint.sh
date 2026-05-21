#!/bin/sh
set -e

echo "[entrypoint] Starting Neon Vault application..."

# Führe prisma generate NUR in Development aus, NIEMALS auf dem AWS-Produktionsserver
if [ "$NODE_ENV" != "production" ]; then
  echo "[entrypoint] Generating Prisma client for development..."
  npx prisma generate
else
  echo "[entrypoint] Production mode: Skipping prisma generate (already baked into image)"
fi

# Datenbank-Migrationen ausführen (falls SQLite genutzt wird)
echo "[entrypoint] Running database migrations..."
npx prisma db push --accept-data-loss

echo "[entrypoint] Launching server.js..."
exec node server.js