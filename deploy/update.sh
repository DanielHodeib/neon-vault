#!/usr/bin/env bash
# Puts the newest version from GitHub live without breaking the running site:
# 1. builds and tests it in a separate folder while the old version keeps serving,
# 2. shows everyone a restart countdown, 3. swaps the folders (a few seconds of downtime).
# The previous version stays in <app>.old as a fallback. Data lives outside, in ~/neon-data.
# Usage on the server:  bash deploy/update.sh [warning seconds, default 60]
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NEW="$APP_DIR.new"
OLD="$APP_DIR.old"
WARN="${1:-60}"

echo "==> Neue Version neben der laufenden bauen"
rm -rf "$NEW"
git clone -q --depth 1 "$(git -C "$APP_DIR" remote get-url origin)" "$NEW"
cp "$APP_DIR/.env" "$NEW/.env"
cd "$NEW"
npm ci --no-audit --no-fund
npm test # a broken version never goes live
npm run build

echo "==> Countdown für alle Spieler ($WARN s)"
echo "$WARN" > "$APP_DIR/restart-request"
sleep $((WARN + 3))

echo "==> Umschalten"
sudo systemctl stop neon-vault # refunds open stakes
rm -rf "$OLD"
mv "$APP_DIR" "$OLD"
mv "$NEW" "$APP_DIR"
sudo systemctl start neon-vault
echo "Update fertig – $(git -C "$APP_DIR" log -1 --format='%h %s')"
