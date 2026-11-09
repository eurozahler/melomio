#!/usr/bin/env bash
# Bereitet den Testserver für die App vor (Modul M11). Läuft als deploy: sudo bash 03-app-vorbereiten.sh
# Öffnet NICHTS nach außen – die Firewall bleibt bei „nur SSH“. Freischalten ist ein eigener Schritt.
#
# Legt an: Auslagerungsspeicher (für den Build), eigene Datenbank melomio_staging,
# /opt/melomio/app mit .env (Testbetrieb, zufällige Schlüssel) und caddy.env (Passwortschutz).
set -euo pipefail

DOMAIN="${1:-staging.melomio.de}"
ACME_EMAIL="${2:-}"
APP=/opt/melomio/app

echo "== 1. Auslagerungsspeicher (2 GB) – der Next.js-Build braucht mehr als 2 GB RAM =="
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== 2. Eigene Datenbank für den Testserver (getrennt von melomio_dev und melomio_test) =="
cd /opt/melomio/postgres
if ! docker compose exec -T postgres psql -U melomio -d melomio_dev -Atc \
  "select 1 from pg_database where datname='melomio_staging'" | grep -q 1; then
  docker compose exec -T postgres psql -U melomio -d melomio_dev -c "CREATE DATABASE melomio_staging OWNER melomio;"
fi
PGPASS="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"

echo "== 3. App-Ordner und Konfiguration =="
install -d -m 750 -o deploy -g deploy "$APP"
cd "$APP"
if [ ! -f .env ]; then
  umask 077
  cat > .env <<EOF
APP_MODE=test
PAYMENT_PROVIDER=mock
LYRICS_PROVIDER=mock
MUSIC_PROVIDER=mock
EMAIL_PROVIDER=console
STORAGE_PROVIDER=local
DATABASE_URL=postgres://melomio:${PGPASS}@127.0.0.1:5432/melomio_staging
APP_BASE_URL=https://${DOMAIN}
BETTER_AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-48)
AUTH_RATE_LIMIT=on
STORAGE_LOCAL_DIR=/data/storage
EOF
  chown deploy:deploy .env
  echo "   .env angelegt (Testbetrieb, alle Bausteine im Testmodus)."
else
  echo "   .env existiert schon – unverändert gelassen."
fi

if [ ! -f caddy.env ]; then
  umask 077
  BASIC_PASS="$(openssl rand -base64 18 | tr -d '\n=+/')"
  HASH="$(docker run --rm caddy:2 caddy hash-password --plaintext "$BASIC_PASS")"
  cat > caddy.env <<EOF
SITE_DOMAIN=${DOMAIN}
ACME_EMAIL=${ACME_EMAIL}
BASIC_AUTH_USER=melomio
BASIC_AUTH_HASH=${HASH//\$/\$\$}
EOF
  chown deploy:deploy caddy.env
  printf "Passwortschutz der Testseite
Benutzer: melomio
Passwort: %s
" "$BASIC_PASS" > zugang.txt
  chown deploy:deploy zugang.txt
  echo "   Passwort für den Passwortschutz liegt in $APP/zugang.txt (nur für deploy lesbar)."
fi

echo "== Fertig. Firewall unverändert: =="
ufw status | sed -n 1,10p
