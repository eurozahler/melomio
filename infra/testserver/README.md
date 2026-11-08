# Testserver `melomio-test`

Eingerichtet am 08.11.2026 (Modul M0).

| | |
|---|---|
| Anbieter | Hetzner Cloud, Projekt `melomio.de` |
| Typ | CPX12 (2 vCPU AMD, 2 GB RAM, 40 GB SSD), ca. 12 €/Monat zzgl. MwSt. |
| System | Ubuntu 26.04 |
| IPv4 | 2.31.55.169 |
| Anmeldung | nur per SSH-Schlüssel als `deploy` (root und Passwörter gesperrt) |
| SSH-Kurzname | `ssh melomio-test` (Eintrag in `%USERPROFILE%\.ssh\config`) |

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
