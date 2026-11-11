# Neon Vault – Bestandsaufnahme & Neubau-Plan

Stand: 11.11.2026 · Basis: Commit `5be5e4e` (main)

Ziel: **Alle Funktionen behalten**, aber Architektur, Sicherheit, Struktur und UI sauber neu aufbauen.

---

## 1. Was die App heute kann (Funktionsinventar – alles bleibt)

### Spiele
| Spiel | Heute | Datei(en) |
|---|---|---|
| Crash (Neon Rocket) | globaler Raum, Live-Multiplikator, Bet/Cancel/Cashout | `components/games/CrashGame.tsx`, Server |
| Cyber Aviator | Crash-Variante mit eigener Optik | `components/games/CyberAviator.tsx`, `hooks/useCrashSocket.ts` |
| Slots | mehrere Automaten, Free Spins, Cascades, Expanding Bonus | `components/games/SlotsGame.tsx` |
| Blackjack | Solo + Bots, Friends-Räume, Double/Split/Insurance | `components/games/BlackjackGame.tsx`, Server |
| Roulette | Multiplayer-Räume, europ. Rad, Gewinn-Ansagen | `components/games/RouletteGame.tsx`, Server |
| Poker | Solo + Bots **und** Friends-Raum (Buy-in, Blinds, Ready) | `PokerGame.tsx`, `PokerFriendsGame.tsx`, Server |
| Coinflip | PvP-Lobbys, 5 % Hausgebühr | `components/games/CoinflipGame.tsx`, Server |

### Wirtschaft & Progression
- Guthaben (NVC, Start 10.000), tägliche Faucet (5.000)
- XP / Level, VIP-Ränge (Bronze → Neon), wählbarer Rang-Tag, Clan-Tag, „King“-Status
- Daily- & Weekly-Quests mit Belohnungen
- Leaderboards (gesamt + täglich)
- Globale Events: Cashback-Mania, Multiplier-Boost, Rain-Event; manueller „Rain“
- Geld an Freunde senden + Transaktionsverlauf

### Sozial
- Globaler Chat (mit Erwähnungen + Sound), Online-Liste, Präsenz („spielt gerade X“)
- Freunde: Anfragen, annehmen, entfernen, blockieren, Online-Freunde
- Öffentliche Profile (Avatar, Banner, Bio, Chat-Farbe, Lieblingsspiel, Privatsphäre-Optionen)
- Benachrichtigungscenter (Support-Antwort, Geld erhalten, Quest fertig, System, VIP)

### Support
- Tickets mit Chat-Verlauf und Status, Gast-Tickets ohne Login, Support-Ansicht für Staff

### Admin / Staff
- Rollen: OWNER, ADMIN, MODERATOR, SUPPORT, USER mit Rechte-Hierarchie
- Bannen (mit Ablaufdatum + Grund), Rollen setzen, Guthaben ändern, Passwort setzen, Quick-Actions
- Dashboard-Statistiken, Broadcasts / Ankündigungen, globale Events starten/stoppen
- Wartungsmodus mit Endzeit + Wartungsbildschirm

### Konto & Rechtliches
- Registrierung/Login (Benutzername + Passwort), Einstellungen (Sound, Theme, Privatsphäre), Konto löschen
- AGB, Impressum, Datenschutz

---

## 2. Was kaputt ist / nicht passt

### 🔴 Kritisch – Sicherheit (jeder kann betrügen oder Admin spielen)
1. **Gewinne kommen vom Browser.** `POST /api/user/balance {type:"win", amount:999999999999}` und `POST /api/wallet {action:"win"}` schreiben Geld gut, ohne zu prüfen, ob gespielt wurde. Jeder kann sich beliebig Geld geben.
2. **Spielausgang wird im Browser berechnet.** Slots, Blackjack-Solo und Poker-Solo würfeln mit `Math.random()` im Client und melden dann `addWin`. Manipulierbar über die Browser-Konsole.
3. **Game-Server glaubt dem Client alles.** Beim Socket-Connect kommen `username`, `userId`, `role`, `balance`, `isKing` aus der URL (`socket.handshake.query`, `game-server/server.js:3391`). Wer `?role=OWNER` oder einen fremden Namen mitschickt, ist es. Admin-Events (`admin_broadcast`, globale Events) prüfen nur diese gefälschte Rolle. Fehlt `balance`, gilt `Number.MAX_SAFE_INTEGER`.
4. **Zwei getrennte Kontostände.** Game-Server hält Guthaben nur im RAM, die DB ein anderes. Nach einem Neustart oder Reconnect laufen sie auseinander → „verschwundenes“ oder doppeltes Geld.
5. **Interne APIs offen**, wenn `INTERNAL_API_TOKEN` nicht gesetzt ist (`isAuthorizedInternalRequest` gibt dann `true` zurück) – z. B. Benachrichtigungen für beliebige User erzeugen.
6. **Kein Rate-Limit** bei Login/Registrierung/Chat; CORS erlaubt pauschal `*.life`, `10.*`, `192.168.*` usw.
7. Ban wird nur beim Login geprüft; eine laufende JWT-Session bleibt gültig.

### 🟠 Architektur & Struktur
- **`MainHubRealtime.tsx` = 3.761 Zeilen**, 123 `useState/useEffect`, 37 Socket-Listener – Chat, Profil, Einstellungen, Rain, Events, Navigation, alles in einer Datei.
- **`game-server/server.js` = 5.017 Zeilen** reines JavaScript, alle Spiele + Chat + Admin + Events in einer Datei, kein Typcheck, keine Tests.
- **Bis zu 6 Socket-Verbindungen pro Tab** (Hub, Leaderboard, Crash, Blackjack, Roulette, Poker öffnen je eine eigene). Ursache für doppelte Online-User, „Ghost-Spins“ und Listener-Leaks – siehe die vielen `fix(roulette)`-Commits.
- Navigation über `/hub?game=…` statt echter Routen → kein Zurück-Button, kein Code-Splitting, alles wird auf einmal geladen. Gleichzeitig gibt es zusätzlich `/crash`, `/crash-aviator`, `/quests`, `/leaderboard` als Doppelungen.
- **Doppelte APIs:** `/api/wallet` vs. `/api/user/balance`; `/api/auth/login` vs. NextAuth; `/api/support` vs. `/api/support/tickets`; Freunde/Support/Notifications sowohl per REST als auch per Socket (Server ruft dafür wieder die App über HTTP auf).
- Guthaben als **String** mit `parseFloat` gerechnet → Rundungsfehler; besser Ganzzahl (Cents/BigInt).
- Altes Quest-System (`QuestProgress`, `dailyQuestClaimed` auf User) neben neuem (`UserQuest`).
- **Toter Code:** `HomeLeaderboardModal`, `hooks/useGlobalBots.ts`, `app/WelcomeLanding.tsx`, leeres `dev.db`.
- Zwei Footer (`LegalFooter`, `CorporateFooter`), zwei Poker-Komponenten, zwei Crash-Komponenten mit eigener Logik.

### 🟡 Infrastruktur
- Prisma-Schema sagt **SQLite**, `docker-compose.yml` setzt **Postgres + Redis** → passt nicht zusammen. Es gibt **keine Migrationen**, aber der Container führt `prisma migrate deploy` aus.
- README beschreibt Scripts, die es nicht gibt (`dev:lan`, `deploy:up`, `dev:game-server`).
- Hardcodierte Tailscale-/LAN-Hosts in `next.config.ts`; 3 Tunnel-Scripts, Vercel- *und* AWS-*und* Docker-Anleitung parallel.
- Keine Tests, kein CI.
- Texte gemischt Deutsch/Englisch.

---

## 3. Ziel-Architektur

```
apps/web     Next.js 16 (App Router) – UI + REST (Auth, Profil, Freunde, Support, Admin)
apps/game    Socket.IO-Server in TypeScript – ALLE Spiele, Chat, Präsenz, Events
packages/db  Prisma-Schema + Client (beide Apps nutzen dieselbe DB direkt)
packages/shared  Typen für Socket-Events, Ränge, Formatierung, Spielregeln
```

Grundregeln:
1. **Server ist die einzige Wahrheit.** Browser schickt nur Absichten („setze 100 auf Rot“). Zufall, Auswertung und Auszahlung passieren auf dem Server.
2. **Ein Ledger.** Jede Kontoänderung ist eine Zeile in `LedgerEntry` (userId, Betrag in Cents, Grund, Spiel-Runde) in **einer DB-Transaktion** mit dem Kontostand. Kein Guthaben im RAM.
3. **Echte Socket-Auth.** Client bekommt von Next.js ein kurzlebiges signiertes Token; der Game-Server prüft es und lädt Rolle/Name/Ban-Status aus der DB. Nichts aus `handshake.query` wird geglaubt.
4. **Eine Socket-Verbindung pro Tab**, über einen React-Context bereitgestellt; Spiele abonnieren nur ihren Raum.
5. **Echte Routen:** `/play/crash`, `/play/slots`, `/friends`, `/support`, `/admin/...` mit gemeinsamem Layout (Sidebar, Chat, Balance).
6. **Postgres überall** (lokal per Docker), Migrationen eingecheckt.
7. Provably-Fair (Server-Seed-Hash vor der Runde zeigen) für Crash, Slots, Roulette, Coinflip – optional, aber billig, wenn die Engine sowieso neu ist.

---

## 4. Plan in Phasen

Jede Phase endet mit einer lauffähigen App. Reihenfolge = nach Risiko.

### Phase 0 – Aufräumen & Fundament (1–2 Tage)
- Branch `rebuild`, toten Code löschen, README auf den echten Stand bringen.
- Monorepo-Struktur (npm workspaces), Game-Server auf TypeScript umstellen (erst nur umbenennen + Typen).
- Prisma auf Postgres, erste Migration, `docker compose up` startet DB lokal.
- ESLint/Prettier/tsc + GitHub Action (lint, typecheck, test).

### Phase 1 – Sicherheit & Geld (wichtigste Phase)
- `/api/user/balance` POST und `/api/wallet` `win`/`bet`/`refund` **entfernen**; nur noch Faucet bleibt als Server-Aktion.
- `LedgerEntry`-Tabelle + `balance` als `BigInt` (Cents); Migrationsskript für bestehende Kontostände.
- Socket-Auth per signiertem Token; Rolle/Ban aus DB; Admin-Events prüfen DB-Rolle.
- `INTERNAL_API_TOKEN` Pflicht (Start ohne Token = Abbruch); interne HTTP-Rundreisen Game-Server→App entfallen, weil beide direkt die DB nutzen.
- Rate-Limit für Login/Register/Chat, strikte CORS-Liste aus ENV, Ban-Check bei jeder Session.
- Tests: Ledger kann nie negativ werden, doppelte Auszahlung unmöglich.

### Phase 2 – Spiel-Engines auf den Server
Pro Spiel ein Modul `apps/game/src/games/<spiel>/` mit reiner Logik (testbar) + dünnem Socket-Handler:
1. Crash (+ Aviator als zweite Optik auf **derselben** Engine)
2. Coinflip
3. Roulette
4. Slots (Spin-Ergebnis vom Server, Client animiert nur)
5. Blackjack (Solo = Raum mit Bots, Friends = Raum mit Code – eine Engine)
6. Poker (Solo + Friends zusammenlegen, Bots serverseitig)

Je Spiel: Unit-Tests für Auszahlungen und RTP-Simulation (z. B. 1 Mio. Runden → Hausvorteil im erwarteten Bereich).

### Phase 3 – Frontend neu strukturieren
- App-Shell: `app/(app)/layout.tsx` mit Sidebar, Top-Bar (Balance, Notifications), einklappbarem Chat.
- `MainHubRealtime` zerlegen in: `ChatPanel`, `OnlineList`, `RainBanner`, `EventBanner`, `SettingsPage`, `ProfilePage` … jede Datei < 300 Zeilen.
- `SocketProvider` (eine Verbindung) + kleine Hooks pro Bereich (`useChat`, `useCrash`, `useBalance`).
- Zustand-Store nur noch für UI-State; Guthaben kommt ausschließlich vom Server-Event `balance_updated`.
- Ein Footer, eine Komponenten-Bibliothek (Button, Card, Modal, Input) für einheitliches Design.

### Phase 4 – Features sauber nachziehen
- Quests: ein System (`UserQuest`), Fortschritt kommt automatisch aus dem Ledger/Spiel-Events statt per Client-Aufruf `/api/quests/progress`.
- Freunde, Geld senden, Benachrichtigungen, Support: nur noch REST + ein Socket-Push „etwas ist neu“.
- Admin-Bereich in Unterseiten aufteilen (Users, Tickets, Events, System), jede Aktion mit Audit-Log.
- Events/Rain auszahlen über das Ledger.

### Phase 5 – Design & Qualität
- Neues einheitliches Neon-Design, mobil benutzbar, Ladezustände/Fehlerzustände überall.
- Eine Sprache (Deutsch oder Englisch) – siehe offene Fragen.
- Playwright-Smoke-Test: registrieren → Faucet → je Spiel eine Runde → Leaderboard.

### Phase 6 – Deployment
- Ein Weg: Docker Compose (web, game, postgres, nginx) auf der AWS-EC2 Frankfurt; Vercel- und Tunnel-Kram raus.
- Backups der DB, Health-Checks, Logs.

---

## 5. Offene Fragen an dich
1. **Sprache der Oberfläche:** Deutsch, Englisch oder umschaltbar?
2. **Bestehende Daten:** Müssen echte Nutzer + Kontostände übernommen werden, oder darf die DB neu starten?
3. **Bots / Fake-Spieler** (`useGlobalBots`, war tot): weg lassen oder bewusst wieder rein?
4. **Neubau im selben Repo** auf Branch `rebuild` (empfohlen) oder ganz neues Repo?
