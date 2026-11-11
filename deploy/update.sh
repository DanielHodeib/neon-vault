#!/usr/bin/env bash
# Brings the server to the newest version on GitHub: pull, test, build, restart.
# Usage on the server:  bash deploy/update.sh   (also run automatically by the update timer)
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci
# A broken version never goes live: the running app keeps going if tests fail.
npm test
npm run build
sudo systemctl restart neon-vault
echo "Update fertig – $(git log -1 --format='%h %s')"
