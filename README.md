# Neon Vault

Social Casino mit Spielgeld (NVC): Crash, Slots, Blackjack, Roulette, Poker und Coinflip. Dazu Chat, Freunde, Quests, Bestenlisten, Support-Tickets und ein Admin-Bereich.

## Einrichten (einmalig)

```bash
npm install
```

```bash
cp .env.example .env
```

## Starten

```bash
npm run build && npm start
```

Die App läuft dann auf http://localhost:3000. Beim Start werden Datenbank-Migrationen automatisch ausgeführt.

Admin wirst du, indem du dich normal registrierst und dann in einem zweiten Terminal ausführst:

```bash
npm run set-role -- DeinName OWNER
```

## Online stellen (24/7, gratis)

Schritt-für-Schritt-Anleitung für einen eigenen Server bei Oracle Cloud mit gratis Adresse: [deploy/ANLEITUNG.md](deploy/ANLEITUNG.md).

## Mit Freunden spielen (Tailscale Funnel)

Gratis, mit HTTPS und einer festen Adresse (`https://dein-mac.….ts.net`). Deine Freunde brauchen nichts zu installieren. Es funktioniert, solange dein Mac an ist und `npm start` läuft.

1. Die Tailscale-App öffnen und anmelden, bis „Connected“ dasteht.
2. In einem zweiten Terminal:
   ```bash
   npm run share
   ```
3. Die angezeigte `https://….ts.net`-Adresse an deine Freunde schicken.

Beim allerersten Mal fragt Tailscale nach einer Freischaltung für Funnel. Blockiert dein Netzwerk die Seite `login.tailscale.com`, öffnest du den Link einfach am Handy über mobile Daten.

Damit der Mac beim Spielen nicht einschläft, lässt du nebenbei `caffeinate -d` laufen. Beendet wird alles mit `Ctrl + C`; offene Einsätze werden dabei automatisch zurückgebucht.

## Befehle

| Befehl | Was er tut |
|---|---|
| `npm run dev` | Entwicklungsserver mit Hot Reload |
| `npm run build && npm start` | Produktion |
| `npm run share` | Öffentliche HTTPS-Adresse per Tailscale Funnel |
| `npm run check` | Typecheck, Lint und Tests |
| `npm test` | Spiel-Engines testen (Auszahlungsquoten, Poker-Hände, Side-Pots, Wirtschaft …) |
| `npm run e2e` | Klick-Tests im echten Browser (eigener Testserver + leere Test-Datenbank); einmalig vorher `npx playwright install chromium` |
| `npm run set-role -- Name ROLLE` | Rolle vergeben (OWNER, ADMIN, MODERATOR, SUPPORT, USER) |
| `npm run db:migrate` | Neue Migration nach einer Schema-Änderung |
| `npm run db:studio` | Datenbank im Browser ansehen |
| `npm run backup` | Sofort ein Datenbank-Backup in `backups/` |

Die Datenbank ist die Datei `prisma/dev.db`.

## Backups

Der Server legt beim Start und danach einmal täglich eine Kopie der Datenbank in `backups/` ab (die letzten 14 Tage bleiben). Von Hand geht es mit `npm run backup`. Anderer Ordner, z. B. auf einem USB-Stick: `BACKUP_DIR=/Volumes/Stick/neon-backups` in die `.env`.

Wiederherstellen: Server stoppen, gewünschte Datei als `prisma/dev.db` kopieren, Server starten.

## Projekt außerhalb von iCloud

iCloud legt Kopien wie „datei 2.ts“ an und kann die Datenbank beschädigen. Darum gehört das Projekt in einen normalen Ordner:

```bash
mkdir -p ~/Projects && mv ~/Documents/Neon-Vault/neon-vault ~/Projects/neon-vault
```

Vorher den Server stoppen. Danach im neuen Ordner `npm run build && npm start`.

## Aufbau

```
server.ts      startet Next.js und Socket.IO in einem Prozess
game/          Spiel-Engines (laufen nur auf dem Server) + Socket-Handler
lib/           Datenbank, Sessions, Wallet-Journal, Quests, Events, Ränge
app/actions/   Server Actions (Login, Profil, Freunde, Support, Admin)
app/(app)/     eingeloggte Seiten · app/(auth)/ Login · app/(legal)/ Rechtstexte
components/    UI, Socket-Provider, Spiel-Oberflächen
```

Grundregeln:

- **Der Server entscheidet alles.** Der Browser sendet nur Absichten („setze 100“). Zufall, Auswertung und Auszahlung passieren auf dem Server.
- **Geld ändert sich nur über `applyLedger()`** in `lib/wallet.ts`. Jede Buchung ist eine Zeile in `LedgerEntry`, atomar mit dem Kontostand. Der Kontostand kann nie negativ werden.
- **Quests, Tages-Bestenliste, King-Status und Lieblingsspiel** werden aus diesem Journal berechnet.
- **Identität kommt nur aus dem Session-Cookie**, auch für den Socket.
- Zustand, den Next.js und Socket.IO teilen (DB-Client, Online-Liste, Events), liegt auf `globalThis` (`lib/hub.ts`).
