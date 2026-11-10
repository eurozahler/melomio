#!/usr/bin/env bash
# Prüft die neueste Sicherung, ohne etwas Bestehendes anzufassen: spielt sie in eine NEUE, temporäre
# Datenbank ein, zählt Tabellen und Bestellungen und löscht die Test-Datenbank danach wieder.
# Aufruf: bash /opt/melomio/backup/restore-test.sh
set -euo pipefail
DIR=/opt/melomio/backups
PG=postgres-postgres-1
APP=/opt/melomio/app
DUMP=$(ls -t "$DIR"/db-*.dump | head -1)
URL=$(grep '^DATABASE_URL=' "$APP/.env" | cut -d= -f2- | sed -E 's#@[^/]+/#@127.0.0.1:5432/#')
TEST_DB=melomio_restore_test
ADMIN_URL=$(printf '%s' "$URL" | sed -E "s#/[^/?]+(\?|$)#/postgres\1#")
TEST_URL=$(printf '%s' "$URL" | sed -E "s#/[^/?]+(\?|$)#/$TEST_DB\1#")

echo "Teste Wiederherstellung von $(basename "$DUMP") …"
docker exec "$PG" psql "$ADMIN_URL" -qc "drop database if exists $TEST_DB" -c "create database $TEST_DB"
docker exec -i "$PG" pg_restore --no-owner --dbname="$TEST_URL" < "$DUMP"
docker exec "$PG" psql "$TEST_URL" -At -c "select 'Tabellen: ' || count(*) from information_schema.tables where table_schema='public'" \
  -c "select 'Bestellungen: ' || count(*) from orders" -c "select 'Rechnungen: ' || count(*) from invoices"
docker exec "$PG" psql "$ADMIN_URL" -qc "drop database $TEST_DB"
FILES=$(ls -t "$DIR"/files-*.tgz | head -1)
echo "Dateien-Archiv $(basename "$FILES"): $(tar tzf "$FILES" | grep -c -v '/$') Dateien lesbar"
echo "✓ Wiederherstellung funktioniert (Test-Datenbank wieder gelöscht)."
