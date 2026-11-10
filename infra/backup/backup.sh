#!/usr/bin/env bash
# Tägliche Sicherung von Datenbank und Dateien (Songs, Videos, Rechnungen).
# Aufruf auf dem Server:  bash /opt/melomio/backup/backup.sh
# Einrichtung (täglich 02:15):  bash /opt/melomio/backup/cron-einrichten.sh
#
# Ablage: /opt/melomio/backups (14 Tage). Optional zusätzlich außer Haus (z. B. Hetzner Storage Box):
#   BACKUP_REMOTE="u123456@u123456.your-storagebox.de:melomio"  in /opt/melomio/backup/backup.env
set -euo pipefail

APP=/opt/melomio/app
DIR=/opt/melomio/backups
KEEP_DAYS=14
PG=postgres-postgres-1
[ -f /opt/melomio/backup/backup.env ] && . /opt/melomio/backup/backup.env

TS=$(date +%Y-%m-%d_%H%M)
mkdir -p "$DIR"
chmod 700 "$DIR"

# Datenbank-Adresse der App, im Postgres-Container über dessen eigenen Port 5432 erreichbar
URL=$(grep '^DATABASE_URL=' "$APP/.env" | cut -d= -f2- | sed -E 's#@[^/]+/#@127.0.0.1:5432/#')
DB=$(printf '%s' "$URL" | sed -E 's#.*/([^/?]+).*#\1#')

echo "[$(date -Is)] Sicherung $TS ($DB) …"
docker exec "$PG" pg_dump --format=custom --no-owner "$URL" > "$DIR/db-$DB-$TS.dump"
# Prüfen, ob die Sicherung lesbar ist
docker exec -i "$PG" pg_restore --list < "$DIR/db-$DB-$TS.dump" > /dev/null

# Archiv im Container packen und dem aufrufenden Benutzer übergeben (sonst gehört es root)
docker run --rm --user root --entrypoint sh \
  -v app_storage:/data:ro -v "$DIR":/backup \
  melomio-app:latest -c "tar czf /backup/files-$TS.tgz -C /data . && chown $(id -u):$(id -g) /backup/files-$TS.tgz"

chmod 600 "$DIR"/db-*.dump "$DIR"/files-*.tgz
echo "[$(date -Is)] fertig: $(du -h "$DIR/db-$DB-$TS.dump" | cut -f1) Datenbank, $(du -h "$DIR/files-$TS.tgz" | cut -f1) Dateien"

# Alte Sicherungen entfernen
find "$DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'files-*.tgz' \) -mtime +"$KEEP_DAYS" -delete

# Außer Haus kopieren (falls eingerichtet)
if [ -n "${BACKUP_REMOTE:-}" ]; then
  rsync -a -e "ssh -p ${BACKUP_REMOTE_PORT:-23}" "$DIR/db-$DB-$TS.dump" "$DIR/files-$TS.tgz" "$BACKUP_REMOTE/"
  echo "[$(date -Is)] außer Haus kopiert nach $BACKUP_REMOTE"
fi
