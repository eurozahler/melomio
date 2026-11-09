# Testserver `melomio-test`

Eingerichtet am 08.11.2026 (Modul M0).

|              |                                                                     |
| ------------ | ------------------------------------------------------------------- |
| Anbieter     | Hetzner Cloud, Projekt `melomio.de`                                 |
| Typ          | CPX12 (2 vCPU AMD, 2 GB RAM, 40 GB SSD), ca. 12 €/Monat zzgl. MwSt. |
| System       | Ubuntu 26.04                                                        |
| IPv4         | 2.31.55.169                                                         |
| Anmeldung    | nur per SSH-Schlüssel als `deploy` (root und Passwörter gesperrt)   |
| SSH-Kurzname | `ssh melomio-test` (Eintrag in `%USERPROFILE%\.ssh\config`)         |

## Sicherheit

- Hetzner-Firewall `melomio-test-fw` und zusätzlich `ufw` auf dem Server: eingehend nur SSH (Port 22).
- `fail2ban` sperrt wiederholte Fehlversuche bei SSH.
- Automatische Sicherheitsupdates (`unattended-upgrades`).

## PostgreSQL

- PostgreSQL 18 im Docker-Container, Konfiguration in `/opt/melomio/postgres/` (`compose.yaml`, `.env` mit Passwort, nur für `deploy` lesbar).
- Datenbanken: `melomio_dev` (Entwicklung) und `melomio_test` (automatische Tests), Benutzer `melomio`.
- Nur an `127.0.0.1:5432` gebunden, also **nicht aus dem Internet erreichbar**.
- Zugriff vom PC: `scripts\db-tunnel.ps1` starten → `localhost:5433`. Die Zugangsdaten stehen in `.env.local` (nicht in Git).
- Keine Backups: Das ist ein Testserver mit Wegwerfdaten.

## Skripte

- `01-setup.sh`: Grundeinrichtung (einmalig als root)
- `02-harden-ssh.sh`: SSH absichern (erst nach erfolgreichem Test von `deploy`)
- `check.sh`: Zustandsprüfung, nur lesend: `scp` auf den Server, dann `sudo bash check.sh`

## App (Modul M11) – vorbereitet, noch nicht freigeschaltet

Die App läuft auf dem Testserver in Docker: **Webseite**, **Worker** und **Caddy** (HTTPS + Passwortschutz).
Sie verwendet eine eigene Datenbank `melomio_staging`, damit sie nicht mit deinem PC-Worker um Aufträge konkurriert.
Alle Bausteine laufen im Testmodus: keine echten Zahlungen, keine Kosten, E-Mails nur im Test-Postfach `/dev/mailbox`.

| Datei                           | Zweck                                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| `Dockerfile` (Projekt)          | ein Image für Webseite, Worker und Migrationen (mit FFmpeg und Schrift)   |
| `app/compose.yaml`              | Dienste `migrate` (einmalig), `web`, `worker`, `caddy`                    |
| `app/Caddyfile`                 | HTTPS-Zertifikat, Passwortschutz (außer Zahlungs-Webhook), `noindex`      |
| `03-app-vorbereiten.sh`         | Auslagerungsspeicher, Datenbank, `.env` und `caddy.env` mit Zufallswerten |
| `scripts/testserver-deploy.ps1` | vom PC aus: letzten Commit übertragen, bauen, starten                     |

### Schritte (erst nach deiner Freigabe)

1. **Subdomain festlegen** (Vorschlag `staging.melomio.de`) und bei Strato einen DNS-Eintrag anlegen:
   Typ `A`, Name `staging`, Wert `2.31.55.169`. Die Hauptdomain bleibt unverändert (Umzug erst in C10).
2. **Vorbereiten** (öffnet nichts nach außen):
   `scp infra/testserver/03-app-vorbereiten.sh melomio-test:` und dann
   `ssh melomio-test "sudo bash 03-app-vorbereiten.sh staging.melomio.de deine@adresse.de"`.
   Das Passwort für den Passwortschutz liegt danach in `/opt/melomio/app/zugang.txt`.
3. **Übertragen und starten:** `.\scripts\testserver-deploy.ps1` (der erste Build dauert einige Minuten).
4. **Freischalten:** Port 80 und 443 öffnen, in der Hetzner-Firewall `melomio-test-fw` **und** auf dem Server:
   `ssh melomio-test "sudo ufw allow 80/tcp && sudo ufw allow 443/tcp"`.
   Danach holt Caddy das Zertifikat, und die Seite ist unter `https://staging.melomio.de` erreichbar, aber nur mit Passwort.
5. **Admin-Rolle:** auf der Testseite registrieren, dann
   `ssh melomio-test "cd /opt/melomio/app && docker compose run --rm web node node_modules/tsx/dist/cli.mjs scripts/admin/grant-role.ts deine@adresse.de owner"`.

**Wieder schließen:** `sudo ufw delete allow 80/tcp && sudo ufw delete allow 443/tcp` (und die Regel in der Hetzner-Firewall entfernen).
**Protokolle ansehen:** `ssh melomio-test "cd /opt/melomio/app && docker compose logs -f --tail 100 web worker"`.
