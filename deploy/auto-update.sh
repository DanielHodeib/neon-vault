#!/usr/bin/env bash
# Run by the neon-vault-update timer: updates only when GitHub has a newer commit
# whose CI run (.github/workflows/ci.yml) is green, and never retries a version that was rolled back.
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

if [[ -z "${SKIP_CI_GATE:-}" ]]; then
  REPO="$(git remote get-url origin | sed -E 's#\.git$##; s#.*github\.com[:/]##')"
  # success | pending | none | failure | error (GitHub unreachable: the build and tests on this server still gate the update)
  STATE="$(curl -fsS --max-time 15 -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$REPO/commits/$SHA/check-runs" 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
      try {
        const runs = JSON.parse(s).check_runs;
        if (!runs.length) return console.log("none");
        if (runs.some((r) => r.status !== "completed")) return console.log("pending");
        console.log(runs.every((r) => ["success", "skipped", "neutral"].includes(r.conclusion)) ? "success" : "failure");
      } catch { console.log("error"); }
    });' || echo error)"
  AGE=$(( $(date +%s) - $(git log -1 --format=%ct origin/main) ))
  case "$STATE" in
    success|error) ;;
    pending) exit 0 ;;
    none) [[ $AGE -lt 900 ]] && exit 0 ;; # CI has not started yet; after 15 minutes without any run, deploy anyway
    failure) echo "CI für $SHA ist rot – kein Update."; exit 0 ;;
  esac
fi
echo "Neue Version gefunden: $(git log -1 --format='%h %s' origin/main)"
bash deploy/update.sh
