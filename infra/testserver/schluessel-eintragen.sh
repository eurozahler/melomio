#!/usr/bin/env bash
# Trägt einen geheimen Schlüssel in /opt/melomio/app/.env ein (verdeckte Eingabe) und startet
# Webseite + Worker neu. Weitere Einstellungen ohne Geheimnis können als NAME=WERT folgen.
# Aufruf vom PC, z. B.:
#   ssh -t melomio-test bash schluessel-eintragen.sh MUREKA_API_KEY MUSIC_PROVIDER=mureka
#   ssh -t melomio-test bash schluessel-eintragen.sh ANTHROPIC_API_KEY LYRICS_PROVIDER=anthropic
set -euo pipefail
ENV=/opt/melomio/app/.env

NAME="${1:-}"
if ! [[ "$NAME" =~ ^[A-Z][A-Z0-9_]*$ ]]; then echo "Aufruf: bash schluessel-eintragen.sh NAME [NAME=WERT …]"; exit 1; fi
shift
for extra in "$@"; do
  if ! [[ "$extra" =~ ^[A-Z][A-Z0-9_]*=[A-Za-z0-9._:/@-]*$ ]]; then echo "Ungültige Einstellung: $extra"; exit 1; fi
done

read -r -s -p "Wert für $NAME einfügen (Rechtsklick), dann Enter: " VALUE
echo
VALUE="$(printf '%s' "$VALUE" | tr -d '[:space:]')"
if [ -z "$VALUE" ]; then echo "Nichts eingegeben – nichts geändert."; exit 1; fi

cp "$ENV" "$ENV.bak"
sed -i "/^$NAME=/d" "$ENV"
printf '%s=%s\n' "$NAME" "$VALUE" >> "$ENV"
for extra in "$@"; do
  sed -i "/^${extra%%=*}=/d" "$ENV"
  echo "$extra" >> "$ENV"
done
chmod 600 "$ENV" "$ENV.bak"

cd /opt/melomio/app
docker compose up -d web worker
sleep 10
if docker compose ps --format '{{.Service}} {{.Status}}' | grep -E '^(web|worker) ' | grep -q 'Restarting'; then
  echo "⚠ Start fehlgeschlagen – alte Einstellungen werden wiederhergestellt. Protokoll:"
  docker compose logs --tail 15 worker
  cp "$ENV.bak" "$ENV"
  docker compose up -d web worker
  exit 1
fi
echo "✓ $NAME ist eingetragen${*:+, dazu: $*}."
docker compose logs --tail 3 worker | grep -o 'bereit.*' || true
