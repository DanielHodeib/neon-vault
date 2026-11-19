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

FAILED="$APP_DIR.failed"
ENV_VALUE() { sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" "$APP_DIR/.env" | head -1; }
DB_FILE="$(ENV_VALUE DATABASE_URL | sed -n 's#^file:\([^?]*\).*#\1#p')"
PORT="$(ENV_VALUE PORT)"; PORT="${PORT:-3000}"

echo "==> Neue Version neben der laufenden bauen"
rm -rf "$NEW" "$FAILED"
git clone -q --depth 1 "$(git -C "$APP_DIR" remote get-url origin)" "$NEW"
cp "$APP_DIR/.env" "$NEW/.env"
cd "$NEW"
NEW_SHA="$(git rev-parse HEAD)"
npm ci --no-audit --no-fund
npm test # a broken version never goes live
npm run build

echo "==> Countdown für alle Spieler ($WARN s)"
echo "$WARN" > "$APP_DIR/restart-request"
sleep $((WARN + 3))

echo "==> Umschalten"
sudo systemctl stop neon-vault # refunds open stakes

# Snapshot of the database before the new version migrates it; used to go back if the new version doesn't come up.
SNAP=""
if [[ "$DB_FILE" == /* && -f "$DB_FILE" ]] && command -v sqlite3 >/dev/null; then
  mkdir -p "$(dirname "$DB_FILE")/backups"
  SNAP="$(dirname "$DB_FILE")/backups/pre-update-$(date +%Y%m%d-%H%M%S).db"
  sqlite3 "$DB_FILE" "VACUUM INTO '$SNAP'"
  ls -1t "$(dirname "$DB_FILE")"/backups/pre-update-*.db | tail -n +6 | xargs -r rm -f # keep the newest 5
  echo "    Datenbank-Snapshot: $SNAP"
else
  echo "    WARNUNG: kein Datenbank-Snapshot (DATABASE_URL ist kein absoluter Pfad oder sqlite3 fehlt)"
fi

rm -rf "$OLD"
mv "$APP_DIR" "$OLD"
mv "$NEW" "$APP_DIR"
sudo systemctl start neon-vault

echo "==> Prüfen, ob die neue Version läuft"
healthy() {
  for _ in $(seq 1 45); do
    curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:$PORT/login" && return 0
    sleep 2
  done
  return 1
}
if healthy; then
  echo "Update fertig – $(git -C "$APP_DIR" log -1 --format='%h %s')"
  exit 0
fi

echo "!! Neue Version startet nicht – zurück zur alten"
sudo systemctl stop neon-vault || true
mv "$APP_DIR" "$FAILED"
mv "$OLD" "$APP_DIR"
if [[ -n "$SNAP" ]]; then # the old code must see the old database (the new version may have migrated it)
  cp "$SNAP" "$DB_FILE"
  rm -f "$DB_FILE-wal" "$DB_FILE-shm"
fi
echo "$NEW_SHA" > "$(dirname "$APP_DIR")/neon-failed-sha" # auto-update.sh skips this commit from now on
sudo systemctl start neon-vault
echo "Alte Version läuft wieder. Fehlgeschlagene Version zum Ansehen: $FAILED"
exit 1
