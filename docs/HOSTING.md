# Mit Freunden spielen

Zwei Wege, je nachdem ob es schnell oder dauerhaft sein soll.

## A) Sofort, vom eigenen Laptop (Cloudflare-Tunnel)

Kostenlos, ohne Domain, ohne Server. Läuft nur, solange dein Laptop an ist, und die Adresse ändert sich bei jedem Start.

```bash
brew install cloudflared
```

```bash
npm run build && npm start
```

In einem zweiten Terminal:

```bash
npm run share
```

cloudflared zeigt eine Adresse wie `https://irgendwas.trycloudflare.com`. Die schickst du deinen Freunden. Sie registrieren sich dort und spielen mit.

## B) Dauerhaft: eigener Server + Gratis-Domain mit HTTPS

Deine Domain `daniel-hodeib-vault.chickenkiller.com` (FreeDNS) bleibt bestehen. Caddy holt und erneuert das HTTPS-Zertifikat automatisch.

1. **Server**: Die bestehende AWS-EC2-Instanz in Frankfurt reicht. Alternativ geht jeder kleine Linux-Server mit Docker; Oracle Cloud Free Tier ist dauerhaft kostenlos.
2. **Ports**: In der Security Group nur `22`, `80` und `443` öffnen. `3000` und `5000` werden nicht mehr gebraucht.
3. **DNS**: Auf freedns.afraid.org den A-Record der Domain auf die öffentliche IP des Servers setzen. Eine Elastic IP verhindert, dass sie sich beim Neustart ändert.
4. **Altes Deployment stoppen** (falls es noch läuft):
   ```bash
   docker compose -f docker-compose.deploy.yml down
   ```
5. **Neu starten**:
   ```bash
   git pull
   ```
   ```bash
   cp .env.example .env
   ```
   ```bash
   docker compose up -d --build
   ```
6. Nach etwa einer Minute ist `https://daniel-hodeib-vault.chickenkiller.com` erreichbar. Danach registrierst du dich und machst dich zum Admin:
   ```bash
   docker compose exec app npm run set-role -- DeinName OWNER
   ```

**Updates einspielen:** `git pull && docker compose up -d --build`

**Backup:** Die Datenbank liegt im Docker-Volume `data`:

```bash
docker compose cp app:/data/neon.db ./backup-$(date +%F).db
```

### Hinweise

- Die alte Datenbank vom vorherigen Deployment passt nicht zum neuen Schema. Der neue Stand startet mit einer leeren Datenbank.
- Wenn Login oder Formulare hinter einem anderen Proxy mit „Invalid Server Actions request“ scheitern, reicht der Proxy den `Host`-Header nicht durch. Caddy und cloudflared tun das von selbst.
