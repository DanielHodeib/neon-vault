# Neon Vault auf Oracle Cloud - Komplettes Produktions-Setup

Willkommen! Diese Anleitung führt dich Schritt für Schritt durch die Einrichtung deiner kostenlosen Neon Vault Casino-Plattform auf Oracle Cloud. Folge jedem Schritt genau.

---

## Teil 1: Oracle Cloud Account erstellen & Ampere A1 Instanz wählen

### Schritt 1.1: Account erstellen

1. Gehe zu [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
2. Klicke auf **"Sign Up"** oder **"Kostenlos beginnen"**
3. Wähle dein Land (z.B. Germany)
4. Gib deine E-Mail-Adresse ein
5. Erstelle ein starkes Passwort (mindestens 8 Zeichen, Großbuchstaben, Zahlen, Sonderzeichen)
6. Fülle deine persönlichen Daten aus
7. Gib eine gültige Kreditkarte an (wird nur zur Verifizierung belastet, NICHT abgebucht)
8. Bestätige deine E-Mail-Adresse über den Link, den Oracle dir sendet
9. Nach der Verifizierung erhältst du automatisch 300 USD Free Tier Guthaben für 30 Tage + Always Free Ressourcen

### Schritt 1.2: Die Ampere A1 Compute-Instanz auswählen

1. Melde dich in deinem Oracle Cloud Dashboard an: [cloud.oracle.com](https://cloud.oracle.com)
2. Klicke oben links auf **"Hamburger Menu"** (☰)
3. Gehe zu: **Compute** → **Instances**
4. Klicke auf **"Create Instance"** (Blaue Schaltfläche oben rechts)

**Instanz-Konfiguration:**

- **Name**: `neon-vault-prod` (oder ein beliebiger Name)
- **Availability Domain**: Wähle die empfohlene aus (z.B. `AD-1`)
- **Image and Shape**:
  - Klicke auf **"Edit"** unter "Image"
  - Wähle: **Canonical Ubuntu 22.04 LTS**
  - Klicke auf **"Edit"** unter "Shape"
  - Wähle: **Ampere (A1)** → **VM.Standard.A1.Flex**
  - WICHTIG: Stelle die OCPUs auf **4** und RAM auf **24 GB** (Maximum für Free Tier)
- **Primary VNIC**: Standard lassen
- **Boot Volume**: 100 GB (Standard - wird mit Free Tier abgedeckt)
- **Netzwerk**: Wähle das bestehende VCN oder erstelle ein neues
- **Klicke**: **"Create"**

Die Instanz wird in wenigen Minuten erstellt.

---

## Teil 2: SSH-Key generieren und in Oracle hinterlegen

### Schritt 2.1: SSH-Keys auf deinem Mac generieren

Öffne Terminal und führe aus:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/neon-vault -C "neon-vault@oracle"
```

**Fragen:**
- **"Enter passphrase"**: Lasse leer (drücke Enter)
- **"Enter same passphrase again"**: Lasse leer (drücke Enter)

Die Keys werden erstellt:
- **Private Key**: `~/.ssh/neon-vault` (NIEMALS teilen!)
- **Public Key**: `~/.ssh/neon-vault.pub`

### Schritt 2.2: Public Key in Oracle hochladen

1. Gehe in Oracle Cloud zu: **Compute** → **Instances**
2. Klicke auf deine gerade erstellte Instanz (`neon-vault-prod`)
3. Scrolle nach unten zu **"Primary VNIC"** → Klicke auf den Link
4. Gehe zu **"IPv4 Addresses"**
5. Notiere die **"Public IP Address"** (z.B. `203.0.113.45`)
6. Gehe zurück zur Instanz und klicke auf **"Edit Primary VNIC"**
7. Unter **"SSH Keys"** wählst du **"Upload public key file"**
8. Öffne deine Terminal und führe aus:

```bash
cat ~/.ssh/neon-vault.pub
```

Kopiere die Ausgabe und füge sie in Oracle beim öffentlichen Schlüssel ein.

### Schritt 2.3: SSH-Verbindung testen

Öffne Terminal und verbinde dich:

```bash
ssh -i ~/.ssh/neon-vault ubuntu@YOUR_PUBLIC_IP
```

Ersetze `YOUR_PUBLIC_IP` mit der Adresse aus Schritt 2.2 (Punkt 5).

**Erste Verbindung:** Du wirst gefragt "Are you sure you want to continue connecting (yes/no)?" → Gib `yes` ein.

Herzlichen Glückwunsch! Du bist jetzt auf deinem Oracle Cloud Server verbunden.

---

## Teil 3: Virtual Cloud Network (VCN) - Ingress-Rules konfigurieren

Diese Regeln erlauben eingehenden Traffic für SSH, HTTP, HTTPS und die App.

### Schritt 3.1: Security Group bearbeiten

1. Gehe zurück zu Oracle Cloud Dashboard
2. Klicke auf **"Hamburger Menu"** (☰)
3. Gehe zu: **Networking** → **Virtual Cloud Networks**
4. Wähle dein VCN aus
5. Im VCN klickst du auf **"Security Lists"**
6. Klicke auf die Standard-Security-List

### Schritt 3.2: Ingress-Regeln hinzufügen

Klicke auf **"Add Ingress Rule"** und füge folgende Regeln EINZELN hinzu:

**Regel 1 - SSH (Port 22):**
- **Stateless**: Nein (unchecked lassen)
- **Source Type**: CIDR
- **Source CIDR**: `0.0.0.0/0` (Überall, macht aber nur Sinn wenn du SSH-Keys schützt)
- **IP Protocol**: TCP
- **Source Port Range**: Alle
- **Destination Port Range**: `22`
- **Description**: SSH

**Regel 2 - HTTP (Port 80):**
- **Source CIDR**: `0.0.0.0/0`
- **IP Protocol**: TCP
- **Destination Port Range**: `80`
- **Description**: HTTP

**Regel 3 - HTTPS (Port 443):**
- **Source CIDR**: `0.0.0.0/0`
- **IP Protocol**: TCP
- **Destination Port Range**: `443`
- **Description**: HTTPS

**Regel 4 - App Direct Access (Port 3000):**
- **Source CIDR**: `0.0.0.0/0`
- **IP Protocol**: TCP
- **Destination Port Range**: `3000`
- **Description**: Neon Vault App (falls Direct-Zugriff gewünscht)

Klicke nach jeder Regel auf **"Add Ingress Rule"**.

---

## Teil 4: Docker installation auf Ubuntu

Du bist noch per SSH verbunden. Führe folgende Befehle aus:

### Schritt 4.1: Paketlisten aktualisieren

```bash
sudo apt update
sudo apt upgrade -y
```

### Schritt 4.2: Docker installieren

```bash
sudo apt install -y docker.io docker-compose
```

### Schritt 4.3: Docker-Berechtigungen für User setzen

```bash
sudo usermod -aG docker ubuntu
newgrp docker
```

### Schritt 4.4: Verifizieren dass Docker funktioniert

```bash
docker --version
docker-compose --version
```

Ab hier kannst du `docker` und `docker-compose` Befehle ohne `sudo` ausführen.

---

## Teil 5: Neon Vault Repo klonen und deployen

### Schritt 5.1: Repository klonen

```bash
cd /home/ubuntu
git clone https://github.com/DEIN_USERNAME/neon-vault.git
cd neon-vault
```

Ersetze `DEIN_USERNAME` mit deinem GitHub-Benutzernamen.

### Schritt 5.2: .env Datei erstellen

```bash
nano .env
```

Dies öffnet einen Text-Editor. Füge folgende Variablen ein (angepasst an deine Konfiguration):

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@neon-db:5432/neon_vault"

# Redis
REDIS_URL="redis://neon-redis:6379"

# Next.js
NEXT_PUBLIC_API_URL="https://deine-domain.com"
NEXTAUTH_URL="https://deine-domain.com"
NEXTAUTH_SECRET="RANDOM_SECRET_HIER" # Generiere mit: openssl rand -base64 32

# Game Server
GAME_SERVER_URL="https://deine-domain.com"

# Socket.io
NEXT_PUBLIC_SOCKET_URL="https://deine-domain.com"

# Environment
NODE_ENV="production"
```

**Wichtig:**
- Ersetze `deine-domain.com` mit deiner echten Domain
- Für `NEXTAUTH_SECRET` führe aus:
  ```bash
  openssl rand -base64 32
  ```
  Kopiere das Ergebnis und füge es ein.

**Speichern und Beenden:**
1. Drücke `Ctrl + X`
2. Gib `Y` ein (für "Ja, speichern")
3. Drücke `Enter` (bestätige den Dateinamen)

### Schritt 5.3: Docker-Compose starten

```bash
docker-compose up -d --build
```

Dies wird einige Minuten dauern (Images werden heruntergeladen und gebaut).

**Fortschritt überprüfen:**
```bash
docker-compose logs -f neon-app
```

Drücke `Ctrl + C` wenn der Build fertig ist.

### Schritt 5.4: Datenbank migrieren

```bash
docker exec neon-app npx prisma migrate deploy
```

---

## Teil 6: Nginx Reverse Proxy setup (Optional aber empfohlen)

### Schritt 6.1: Nginx installieren

```bash
sudo apt install -y nginx
```

### Schritt 6.2: Nginx-Konfiguration ersetzen

```bash
sudo nano /etc/nginx/nginx.conf
```

Klicke auf das `nginx.conf` FILE in deinem Repo und kopiere den kompletten Inhalt. Ersetze alles in der Nginx-Datei damit.

**Speichern:** `Ctrl + X` → `Y` → `Enter`

### Schritt 6.3: Nginx neu starten

```bash
sudo systemctl restart nginx
```

Nginx läuft nun auf Port 80 und leitet auf die App weiter.

---

## Teil 7: SSL-Zertifikat mit Let's Encrypt (HTTPS)

### Schritt 7.1: Certbot installieren

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Schritt 7.2: Neues Zertifikat generieren

```bash
sudo certbot certonly --nginx -d deine-domain.com
```

Ersetze `deine-domain.com` mit deiner echten Domain.

**Fragen:**
- **Email-Adresse**: Gib deine E-Mail ein
- **Agree to terms**: `Y`
- **Share email**: `N` (optional)

Das Zertifikat wird in `/etc/letsencrypt/live/deine-domain.com/` gespeichert.

### Schritt 7.3: Nginx mit SSL aktualisieren

```bash
sudo nano /etc/nginx/sites-available/default
```

Ersetze den Inhalt durch:

```nginx
server {
    listen 80;
    server_name deine-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name deine-domain.com;

    ssl_certificate /etc/letsencrypt/live/deine-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/deine-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

Speichern: `Ctrl + X` → `Y` → `Enter`

### Schritt 7.4: Nginx neu starten

```bash
sudo systemctl restart nginx
```

**Auto-Renewal:** Certbot renewt zertifikate automatisch alle 90 Tage.

---

## Teil 8: Deployment automatisieren

### Schritt 8.1: Deploy-Skript ausführbar machen

```bash
chmod +x deploy.sh
```

### Schritt 8.2: Zukünftige Deployments

Um den Code zu aktualisieren, führe einfach aus:

```bash
./deploy.sh
```

Dieses Skript:
1. Zieht den neuesten Code von GitHub
2. Stoppt alle Container
3. Baut neue Images und startet Container
4. Führt Datenbank-Migrationen aus

---

## Teil 9: Server-Überwachung & Logs

### Container-Status überprüfen

```bash
docker-compose ps
```

### Logs der App anschauen

```bash
docker-compose logs -f neon-app
```

### Spezifische Container-Logs

```bash
docker-compose logs -f neon-db      # PostgreSQL
docker-compose logs -f neon-redis   # Redis
```

### In einen Container SSH

```bash
docker exec -it neon-app sh
```

---

## Teil 10: Firewall-Regeln optimieren (Sicherheit)

### SSH nur von bestimmter IP

Wenn du immer von der gleichen IP arbeitest:

```bash
sudo ufw allow from YOUR_IP to any port 22
```

Ersetze `YOUR_IP` mit deiner Home-IP.

### UFW (Uncomplicated Firewall) aktivieren

```bash
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw enable
```

---

## Teil 11: Backup-Strategie

### PostgreSQL-Datenbank sichern

```bash
docker exec neon-db pg_dump -U postgres neon_vault > backup_$(date +%Y%m%d).sql
```

### Backup in die Cloud hochladen

```bash
# Mit S3 kompatiblen Storage
docker exec neon-app aws s3 cp backup.sql s3://your-bucket/
```

---

## Teil 12: Troubleshooting

### Problem: Verbindung zum Server fehlgeschlagen

**Lösung:**
```bash
ssh -vvv -i ~/.ssh/neon-vault ubuntu@YOUR_PUBLIC_IP
```

Die `-vvv` zeigt Debug-Informationen.

### Problem: Container startet nicht

```bash
docker-compose logs neon-app
```

Suche nach Fehlermeldungen.

### Problem: Datenbankverbindung fehlgeschlagen

Überprüfe `.env`:
```bash
docker-compose exec neon-db psql -U postgres -d neon_vault
```

### Problem: WebSocket-Verbindung bricht ab

Das ist meist ein Nginx-Problem. Überprüfe dass die WebSocket-Upgrade-Header in nginx.conf korrekt sind:
```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### Problem: SSL-Zertifikat abgelaufen

```bash
sudo certbot renew --dry-run
```

Certbot erneuert automatisch 30 Tage vor Ablauf.

---

## Teil 13: Produktions-Checkliste

- [ ] Oracle Cloud Account mit Ampere A1 Instanz erstellt
- [ ] SSH-Keys generiert und in Oracle hochgeladen
- [ ] VCN Security-Rules für Ports 22, 80, 443 konfiguriert
- [ ] Docker und docker-compose installiert
- [ ] Repository geklont
- [ ] .env Datei erstellt mit allen Variablen
- [ ] docker-compose up -d --build ausgeführt
- [ ] Prisma Migrationen erfolgt (docker exec neon-app npx prisma migrate deploy)
- [ ] Nginx installiert und konfiguriert
- [ ] SSL-Zertifikat mit Let's Encrypt erstellt
- [ ] https://deine-domain.com ist erreichbar
- [ ] Roulette & Chat funktionieren (WebSockets)
- [ ] Firewall-Regeln gesetzt

---

## Kosten-Übersicht (Best Case = 0 EUR)

| Komponente | Kosten | Bedingung |
|-----------|--------|----------|
| Ampere A1 VM (4 CPU, 24 GB RAM) | 0 EUR | Always Free (unbegrenzt) |
| PostgreSQL 16 (20 GB Speicher) | 0 EUR | Always Free |
| Redis | 0 EUR | Self-hosted in Docker |
| Transfer (Outbound) | 0 EUR | 10 TB/Monat kostenlos |
| Dynamic IP | 0 EUR | Inklusive |
| **Gesamtkosten** | **0 EUR** | ✅ Kostenloses Hosting |

---

## Support & Weitere Hilfe

- **Oracle Dokumentation**: https://docs.oracle.com/
- **Docker Dokumentation**: https://docs.docker.com/
- **Next.js Produktion**: https://nextjs.org/docs/deployment
- **Prisma Migrationen**: https://www.prisma.io/docs/orm/prisma-migrate

---

**Glückwunsch! Dein Neon Vault Casino läuft jetzt auf kostenlosen Oracle Cloud Ressourcen. 🚀**

Kontaktiere Support, wenn Probleme auftreten.
