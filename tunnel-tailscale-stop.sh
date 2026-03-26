#!/bin/sh
set -eu

echo "Disabling Tailscale Funnel..."
tailscale funnel reset --yes >/tmp/neonvault-ts-funnel-stop.log 2>&1 || {
  cat /tmp/neonvault-ts-funnel-stop.log
  exit 1
}
echo "Funnel disabled."
