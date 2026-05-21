# Neon Vault Production Hosting auf AWS EC2 (Frankfurt)

Diese Anleitung beschreibt die produktive Bereitstellung auf AWS EC2 in der Region Frankfurt (`eu-central-1`).

## 1. EC2 in Frankfurt erstellen

1. In AWS Console Region auf `Europe (Frankfurt) eu-central-1` stellen.
2. EC2 Instance erstellen (Ubuntu 22.04 LTS empfohlen).
3. Security Group Inbound Regeln setzen:
- `22/tcp` (SSH)
- `80/tcp` (HTTP)
- `443/tcp` (HTTPS)
- `3000/tcp` (Frontend)
- `5000/tcp` (Backend / Socket)

## 2. SSH Zugriff

```bash
ssh-keygen -t ed25519 -f ~/.ssh/neon-vault-aws -C "neon-vault-aws"
ssh -i ~/.ssh/neon-vault-aws ubuntu@YOUR_EC2_PUBLIC_IP
```

## 3. Docker auf der EC2 installieren

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

## 4. Repository und Env-Dateien

```bash
git clone https://github.com/DanielHodeib/neon-vault.git
cd neon-vault
cp .env.example .env
cp game-server/.env.production.example game-server/.env.production
```

Wichtige Standard-Ports:
- Frontend: `3000`
- Backend: `5000`

## 5. Starten (inkl. automatischer Prisma-Migrationen)

Die App ist so konfiguriert, dass beim Container-Start automatisch ausgeführt wird:

```bash
npx prisma migrate deploy
```

Start:

```bash
docker compose up -d --build
```

## 6. Deployment-Update

```bash
chmod +x deploy.sh
./deploy.sh
```

## 7. Checks

```bash
docker compose ps
docker compose logs -f neon-app
docker compose logs -f neon-backend
```

Wenn du Nginx als Reverse Proxy nutzt, leite Domain Traffic auf `3000` (App) und Socket/Pfade auf `5000` bzw. auf den entsprechenden Socket-Proxy.
