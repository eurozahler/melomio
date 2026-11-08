#!/usr/bin/env bash
# Zustandsprüfung des Testservers (nur lesend)
cd /opt/melomio/postgres
echo "== PostgreSQL =="
docker compose exec -T postgres psql -U melomio -d melomio_dev -Atc "select version();"
docker compose exec -T postgres psql -U melomio -d melomio_dev -Atc "select datname from pg_database where datname like 'melomio%' order by 1;"
docker compose ps --format '{{.Name}} | {{.Status}} | {{.Ports}}'
echo "== Dienste =="
systemctl is-active fail2ban docker ssh unattended-upgrades 2>/dev/null | paste -sd' '
echo "== Firewall =="
ufw status | sed -n '1,8p'
echo "== Benutzer =="
id deploy
echo "== SSH-Einstellungen =="
sshd -T 2>/dev/null | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication) '
echo "== Neustart nötig: $( [ -f /var/run/reboot-required ] && echo ja || echo nein ) =="
