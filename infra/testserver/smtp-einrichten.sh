#!/usr/bin/env bash
# Echte E-Mails (Strato) auf dem Testserver einschalten.
# Aufruf vom PC:  ssh -t melomio-test bash smtp-einrichten.sh
# Fragt das Postfach-Passwort verdeckt ab und trägt alles in /opt/melomio/app/.env ein.
set -euo pipefail
ENV=/opt/melomio/app/.env

read -r -s -p "Passwort für das Postfach hallo@melomio.de: " PASS
echo
if [ -z "$PASS" ]; then echo "Kein Passwort eingegeben – nichts geändert."; exit 1; fi

# Alte E-Mail-Zeilen entfernen, neue anhängen
sed -i '/^EMAIL_PROVIDER=/d; /^SMTP_/d' "$ENV"
{
  echo "EMAIL_PROVIDER=smtp"
  echo "SMTP_HOST=smtp.strato.de"
  echo "SMTP_PORT=465"
  echo "SMTP_USER=hallo@melomio.de"
  printf 'SMTP_PASSWORD=%s\n' "$PASS"
  echo "SMTP_FROM=melomio <hallo@melomio.de>"
} >> "$ENV"
chmod 600 "$ENV"

cd /opt/melomio/app
docker compose up -d web worker
sleep 10
if docker compose ps --format '{{.Service}} {{.Status}}' | grep -E '^(web|worker) ' | grep -q 'Restarting'; then
  echo "⚠ Start fehlgeschlagen – Protokoll:"
  docker compose logs --tail 15 worker
  exit 1
fi
echo "✓ Echte E-Mails sind eingeschaltet. Test: https://staging.melomio.de/passwort-vergessen"
