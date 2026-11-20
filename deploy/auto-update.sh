#!/usr/bin/env bash
# Run by the neon-vault-update timer: updates when GitHub has a newer commit (update.sh builds it and runs the tests
# on this server first), and never retries a version that was rolled back.
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>/tmp/neon-vault-update.lock
flock -n 9 || exit 0 # an update is already running
git fetch -q origin main
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] && exit 0
SHA="$(git rev-parse origin/main)"

FAILED_FILE="$(dirname "$PWD")/neon-failed-sha"
if [[ -f "$FAILED_FILE" && "$(cat "$FAILED_FILE")" == "$SHA" ]]; then
  exit 0 # this exact version was rolled back; wait for a new commit (or delete the file to retry)
fi

echo "Neue Version gefunden: $(git log -1 --format='%h %s' origin/main)"
bash deploy/update.sh
