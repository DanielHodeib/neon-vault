#!/usr/bin/env bash
# Brings the server to the newest version on GitHub: pull, build, restart.
# Usage on the server:  bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci
npm run build
sudo systemctl restart neon-vault
echo "Update fertig – $(git log -1 --format='%h %s')"
