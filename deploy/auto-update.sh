#!/usr/bin/env bash
# Run by the neon-vault-update timer: updates only when GitHub has a newer commit.
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>/tmp/neon-vault-update.lock
flock -n 9 || exit 0 # an update is already running
git fetch -q origin main
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] && exit 0
echo "Neue Version gefunden: $(git log -1 --format='%h %s' origin/main)"
bash deploy/update.sh
