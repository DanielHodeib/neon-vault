#!/bin/sh
set -eu

URL_FILE=".tunnel-last-url.txt"
LOG_FILE=".tunnel-last.log"

ensure_tailscale() {
  if ! tailscale status --json >/tmp/neonvault-ts-status.json 2>/dev/null; then
    echo "Tailscale daemon not running. Starting Tailscale..."
    tailscale up
    tailscale status --json >/tmp/neonvault-ts-status.json
    return
  fi

  state=$(tr -d '\n' </tmp/neonvault-ts-status.json | sed -n 's/.*"BackendState":"\([^"]*\)".*/\1/p')
  if [ "$state" = "Stopped" ]; then
    echo "Tailscale is stopped. Starting..."
    tailscale up
    tailscale status --json >/tmp/neonvault-ts-status.json
  fi
}

extract_dns_name() {
  tailscale status --json 2>/dev/null | tr -d '\n' | sed -n 's/.*"DNSName":"\([^"]*\)".*/\1/p' | sed 's/\.$//'
}

extract_funnel_url() {
  tailscale funnel status 2>/dev/null | grep -Eo 'https://[A-Za-z0-9.-]+' | head -n 1
}

rm -f "$URL_FILE"

ensure_tailscale

echo "Enabling Tailscale Funnel on port 3000..."
tailscale funnel --bg --yes 3000 >/tmp/neonvault-ts-funnel.log 2>&1 || {
  cat /tmp/neonvault-ts-funnel.log
  echo "Could not enable Funnel. Open the Tailscale app and finish login/permissions first, then rerun npm run tunnel."
  exit 1
}

public_url=$(extract_funnel_url || true)
if [ -z "$public_url" ]; then
  dns_name=$(extract_dns_name)
  if [ -z "$dns_name" ]; then
    echo "Could not detect Tailscale public URL."
    tailscale funnel status || true
    tailscale status || true
    exit 1
  fi
  public_url="https://$dns_name"
fi

dns_name=$(printf '%s' "$public_url" | sed 's#^https://##')
printf '%s\n' "$public_url" > "$URL_FILE"

{
  echo "PUBLIC_URL $public_url"
  echo "tailscale_dns=$dns_name"
  tailscale funnel status 2>/dev/null || true
} > "$LOG_FILE"

echo "PUBLIC_URL $public_url"
echo "Saved to $URL_FILE"
echo "Check later with: npm run tunnel:url"
