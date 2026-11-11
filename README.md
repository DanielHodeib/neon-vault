# Neon Vault

Social Casino mit virtueller Währung (NVC): Crash, Aviator, Slots, Blackjack, Roulette, Poker und Coinflip. Dazu kommen Chat, Freunde, Quests, Ranglisten, Support-Tickets und ein Admin-Bereich.

## Starten

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run dev
```

Die App läuft dann auf http://localhost:3000. Für den ersten Admin registrierst du dich normal und vergibst dir die Rolle per Konsole:

```bash
npm run set-role -- DeinName OWNER
```

## Befehle

| Befehl | Was er tut |
|---|---|
| `npm run dev` | Entwicklungsserver (Next.js + Socket.IO in einem Prozess) |
| `npm run check` | Typecheck, Lint und Tests |
| `npm test` | Spiel-Engines testen (Auszahlungsquoten, Poker-Hände, Side-Pots …) |
| `npm run build && npm start` | Produktion |
| `npm run db:migrate` | Neue Migration nach Schema-Änderung |
| `npm run db:studio` | Datenbank im Browser ansehen |
| `npm run share` | Feste öffentliche HTTPS-Adresse per Tailscale Funnel |

## Mit Freunden spielen

Am einfachsten vom eigenen Mac mit fester, kostenloser HTTPS-Adresse über Tailscale Funnel (`npm run share`). Für 24/7-Betrieb gibt es die Docker-Variante mit eigenem Server. Die Schritte stehen in [docs/HOSTING.md](docs/HOSTING.md).

## Aufbau

```
server.ts         startet Next.js und Socket.IO in einem Prozess
game/             Spiel-Engines (laufen nur auf dem Server) + Socket-Handler
lib/              Datenbank, Sessions, Wallet-Journal, Quests, Events, Ränge
app/actions/      Server Actions (Login, Profil, Freunde, Support, Admin)
app/(app)/        eingeloggte Seiten, app/(auth)/ Login, app/(legal)/ Rechtstexte
components/       UI, Socket-Provider, Spiel-Oberflächen
```

Grundregeln:

- **Der Server entscheidet alles.** Der Browser sendet nur Absichten („setze 100“). Zufall, Auswertung und Auszahlung passieren auf dem Server mit `crypto.randomInt`.
- **Geld ändert sich nur über `applyLedger()`** in `lib/wallet.ts`. Jede Buchung ist eine Zeile in `LedgerEntry`, atomar mit dem Kontostand. Der Kontostand kann nicht negativ werden.
- **Quests, Tages-Bestenliste, King-Status und Lieblingsspiel** werden aus dem Journal berechnet. Es gibt keine Zähler, die auseinanderlaufen können.
- **Identität kommt nur aus dem Session-Cookie**, auch für den Socket. Was der Client sonst schickt, wird nicht geglaubt.
- Zustand, den Next.js und Socket.IO teilen (DB-Client, Online-Liste, Events), liegt auf `globalThis` (`lib/hub.ts`).
