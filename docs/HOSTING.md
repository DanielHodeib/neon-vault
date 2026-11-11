# Mit Freunden spielen

## Empfohlen: vom eigenen Mac mit Tailscale Funnel

Kostenlos, mit HTTPS und einer **festen Adresse**, die sich nie ändert (z. B. `https://dein-mac.tailXXXX.ts.net`). Deine Freunde brauchen nichts zu installieren, sie öffnen einfach den Link. Läuft, solange dein Mac an ist.

### Einmalig

1. Die **Tailscale**-App öffnen und dich anmelden. Das Icon in der Menüleiste zeigt dann „Connected“.
2. Im Projektordner:
   ```bash
   npm install
   ```
   ```bash
   cp .env.example .env
   ```
   ```bash
   npx prisma migrate deploy
   ```

### Jedes Mal zum Spielen

Terminal 1 (offen lassen):

```bash
npm run build && npm start
```

Terminal 2 (offen lassen):

```bash
npm run share
```

Beim allerersten Mal zeigt Tailscale einen Link, über den du **Funnel** für dein Konto freischaltest. Den Link einmal öffnen und bestätigen, dann `npm run share` erneut starten. Danach steht die Adresse da (`https://….ts.net`). Die schickst du deinen Freunden; sie bleibt immer gleich.

Wenn du nach dem Registrieren Admin werden willst, in einem dritten Terminal:

```bash
npm run set-role -- DeinName OWNER
```

### Tipps

- Damit der Mac beim Spielen nicht einschläft: Systemeinstellungen → Batterie → „Ruhezustand verhindern, wenn das Display aus ist“ (am Netzteil), oder im Terminal `caffeinate -d` laufen lassen.
- Beenden: in beiden Terminals `Ctrl + C`. Offene Einsätze werden dabei automatisch zurückgebucht.
- Die Datenbank ist die Datei `prisma/dev.db`. Ein Backup ist einfach eine Kopie dieser Datei.

## Optional: 24/7 auf einem eigenen Server (Docker)

Nur nötig, wenn das Spiel auch laufen soll, während dein Mac aus ist. Du brauchst dafür einen Linux-Server mit Docker und eine Domain, deren A-Record auf den Server zeigt. Die Ports 80 und 443 müssen offen sein.

```bash
cp .env.example .env
```

In `.env` setzt du `DOMAIN` auf deine Domain. Dann:

```bash
docker compose up -d --build
```

Caddy holt das HTTPS-Zertifikat automatisch.
