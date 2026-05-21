#!/bin/sh
set -e

echo "[entrypoint] Starting Neon Vault application..."

# Führe prisma generate NIEMALS auf dem AWS-Produktionsserver aus
echo "[entrypoint] Production mode: Skipping prisma generate (already baked into image)"

# Datenbank-Migrationen ausführen (falls SQLite genutzt wird)
echo "[entrypoint] Running database migrations..."
npx prisma db push --accept-data-loss

echo "[entrypoint] Launching server.js..."
exec node server.js