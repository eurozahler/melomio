#!/usr/bin/env bash
# Richtet die tägliche Sicherung um 02:15 Uhr ein (Benutzer deploy, ohne root).
set -euo pipefail
LINE="15 2 * * * bash /opt/melomio/backup/backup.sh >> /opt/melomio/backups/backup.log 2>&1"
mkdir -p /opt/melomio/backups
( crontab -l 2>/dev/null | grep -v 'melomio/backup/backup.sh' || true; echo "$LINE" ) | crontab -
echo "✓ Tägliche Sicherung eingerichtet:"; crontab -l | grep backup.sh
