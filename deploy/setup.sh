#!/usr/bin/env bash
# One-time setup of Neon Vault on a fresh Ubuntu 22.04/24.04 server (e.g. Oracle Cloud Free).
# Usage, from inside the cloned repo:  bash deploy/setup.sh neonvault.duckdns.org
# Installs Node 22, Caddy (HTTPS from Let's Encrypt), builds the app and runs it as a service.
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Bitte die Domain angeben, z. B.: bash deploy/setup.sh neonvault.duckdns.org" >&2
  exit 1
fi
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="$(id -un)"
export DEBIAN_FRONTEND=noninteractive # iptables-persistent would otherwise stop and ask questions

echo "==> Pakete installieren"
sudo -E apt-get update -y
sudo -E apt-get install -y curl git sqlite3 debian-keyring debian-archive-keyring apt-transport-https gnupg iptables-persistent

if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  echo "==> Node.js 22 installieren"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo -E apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  echo "==> Caddy installieren"
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo -E apt-get update -y
  sudo -E apt-get install -y caddy
fi

# Small machines (1 GB RAM) run out of memory while building; a swap file fixes that.
if [[ $(free -m | awk '/Mem:/ {print $2}') -lt 3000 && ! -f /swapfile ]]; then
  echo "==> Swap anlegen (wenig RAM)"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# Oracle's Ubuntu images block everything except SSH in iptables, on top of the cloud firewall.
echo "==> Firewall: Ports 80 und 443 öffnen"
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT -p tcp --dport "$port" -j ACCEPT
done
sudo netfilter-persistent save

echo "==> App bauen"
cd "$APP_DIR"
[[ -f .env ]] || cp .env.example .env
npm ci
npm run build

echo "==> Dienst einrichten"
sudo tee /etc/systemd/system/neon-vault.service >/dev/null <<UNIT
[Unit]
Description=Neon Vault
After=network.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
# Only Caddy talks to the app; port 3000 is never reachable from outside.
Environment=HOST=127.0.0.1
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
# Ctrl+C equivalent: open stakes are refunded on shutdown.
KillSignal=SIGINT
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now neon-vault

echo "==> HTTPS für $DOMAIN einrichten"
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
CADDY
sudo systemctl reload caddy || sudo systemctl restart caddy

echo
echo "Fertig! Neon Vault läuft auf https://$DOMAIN"
echo "Logs ansehen:  journalctl -u neon-vault -f"
