# Neon Vault auf Oracle Cloud (gratis, 24/7)

Am Ende läuft die App rund um die Uhr unter `https://deinname.duckdns.org`, mit HTTPS, Autostart und täglichem Backup. Dein Mac muss dafür nicht mehr laufen.

Zeitaufwand: etwa eine Stunde, nur einmal.

---

## 1. Oracle-Konto anlegen

1. Auf <https://signup.oraclecloud.com> registrieren.
2. **Home Region: „Germany Central (Frankfurt)“** wählen. Das lässt sich später nicht mehr ändern.
3. Eine Kreditkarte wird zur Verifizierung verlangt. Abgebucht wird nichts, solange du im „Always Free“-Bereich bleibst. Upgrade auf „Pay As You Go“ **nicht** anklicken.

## 2. Server erstellen

1. Im Oracle-Menü: **Compute → Instances → Create instance**.
2. Name: `neon-vault`.
3. **Image:** *Change image* → **Canonical Ubuntu 24.04**.
4. **Shape:** *Change shape* → **Ampere** → `VM.Standard.A1.Flex` mit **2 OCPU und 12 GB RAM** (gratis bis 4 OCPU / 24 GB).
   - Meldung „Out of capacity“? Eine andere *Availability Domain* probieren oder es später nochmal versuchen. Notlösung: `VM.Standard.E2.1.Micro` (auch gratis, nur 1 GB RAM, reicht aber).
5. **SSH-Schlüssel:** *Generate a key pair for me* → **Save private key** (Datei z. B. `ssh-key.key`) herunterladen.
6. **Create** klicken. Nach 1–2 Minuten steht bei *Public IP address* eine Adresse wie `141.147.12.34`. Die notierst du dir.

## 3. Ports 80 und 443 öffnen (Oracle-Firewall)

1. Auf der Instanz-Seite unter **Primary VNIC** auf das **Subnet** klicken → **Security Lists** → *Default Security List*.
2. **Add Ingress Rules**, zweimal:
   - Source CIDR `0.0.0.0/0`, IP Protocol TCP, Destination Port `80`
   - Source CIDR `0.0.0.0/0`, IP Protocol TCP, Destination Port `443`

## 4. Gratis-Adresse bei DuckDNS

1. Auf <https://www.duckdns.org> mit GitHub oder Google anmelden.
2. Eine Subdomain anlegen, z. B. `neonvault` → ergibt `neonvault.duckdns.org`.
3. Bei *current ip* die **Public IP** aus Schritt 2 eintragen → **update ip**.

## 5. Neueste Version auf GitHub hochladen (am Mac)

```bash
git push origin main
```

## 6. Auf den Server verbinden und einrichten

Am Mac im Terminal (Pfad und IP anpassen):

```bash
chmod 600 ~/Downloads/ssh-key.key
```

```bash
ssh -i ~/Downloads/ssh-key.key ubuntu@141.147.12.34
```

Die Frage „Are you sure you want to continue connecting?“ beantwortest du mit `yes`. Jetzt bist du auf dem Server und gibst dort ein (Domain anpassen):

```bash
git clone https://github.com/DanielHodeib/neon-vault.git && cd neon-vault && bash deploy/setup.sh neonvault.duckdns.org
```

Das dauert etwa 5 Minuten. Am Ende steht `Fertig! Neon Vault läuft auf https://…`.

## 7. Deine bisherigen Daten mitnehmen

So bleiben Konten, Guthaben, Freunde und alles andere erhalten.

1. Am Mac den lokalen Server mit `Ctrl + C` stoppen. Offene Einsätze werden dabei zurückgebucht.
2. In einem **neuen Mac-Terminal** im Projektordner nacheinander ausführen. Damit wird die App auf dem Server kurz angehalten, deine Datenbank hochgeladen und die App wieder gestartet:

```bash
ssh -i ~/Downloads/ssh-key.key ubuntu@141.147.12.34 "sudo systemctl stop neon-vault"
```

```bash
scp -i ~/Downloads/ssh-key.key prisma/dev.db ubuntu@141.147.12.34:neon-vault/prisma/dev.db
```

```bash
ssh -i ~/Downloads/ssh-key.key ubuntu@141.147.12.34 "sudo systemctl start neon-vault"
```

Danach `https://neonvault.duckdns.org` öffnen und mit deinem bisherigen Konto anmelden.

Ab jetzt läuft alles auf dem Server. Den Mac-Server und Tailscale Funnel brauchst du nicht mehr.

---

## Später: Updates einspielen

Passiert automatisch: Der Server schaut alle 2 Minuten auf GitHub nach. Nach einem `git push origin main` ist die neue Version also spätestens nach etwa 5 Minuten live. Vorher laufen die Tests; schlagen sie fehl, bleibt die alte Version online.

Sofort von Hand aktualisieren:

```bash
ssh -i ~/Downloads/ssh-key.key ubuntu@141.147.12.34 "cd neon-vault && bash deploy/update.sh"
```

Was die automatischen Updates gemacht haben: `journalctl -u neon-vault-update -n 50` (auf dem Server).

## Nützliche Befehle (auf dem Server)

| Befehl | Was er tut |
|---|---|
| `journalctl -u neon-vault -f` | Live-Logs der App (beenden mit `Ctrl + C`) |
| `sudo systemctl restart neon-vault` | App neu starten |
| `sudo systemctl status neon-vault` | Läuft die App? |
| `ls ~/neon-vault/backups` | Tägliche Datenbank-Backups (14 Tage) |
| `cd neon-vault && npm run set-role -- Name OWNER` | Rolle vergeben |

## Backup auf den Mac holen

```bash
scp -i ~/Downloads/ssh-key.key "ubuntu@141.147.12.34:neon-vault/backups/*" ~/Desktop/
```

## Probleme

- **Seite lädt nicht:** Die Ports aus Schritt 3 prüfen, und ob bei DuckDNS die richtige IP steht.
- **„Zertifikat“-Fehler direkt nach der Einrichtung:** 1–2 Minuten warten, Caddy holt das HTTPS-Zertifikat automatisch.
- **App startet nicht:** `journalctl -u neon-vault -n 50` zeigt den Fehler.
