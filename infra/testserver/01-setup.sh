#!/usr/bin/env bash
# Einrichtung des Hetzner-Testservers melomio-test (Ubuntu 26.04)
# Läuft einmalig als root. Siehe docs/ENTWICKLUNGSPLAN.md, Modul M0.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== 1. Systemupdates =="
apt-get update -q
apt-get -y -q -o Dpkg::Options::="--force-confold" upgrade
apt-get -y -q install unattended-upgrades ufw fail2ban ca-certificates curl openssl

echo "== 1b. Automatische Sicherheitsupdates =="
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo "== 2. Benutzer deploy =="
if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-deploy
chmod 440 /etc/sudoers.d/90-deploy
visudo -cf /etc/sudoers.d/90-deploy

echo "== 3. Firewall (ufw) und fail2ban =="
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable
cat > /etc/fail2ban/jail.d/melomio.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "== 4. Docker =="
apt-get -y -q install docker.io docker-compose-v2 docker-buildx
systemctl enable --now docker
usermod -aG docker deploy

echo "== 5. PostgreSQL =="
install -d -m 750 -o deploy -g deploy /opt/melomio /opt/melomio/postgres /opt/melomio/postgres/init
cd /opt/melomio/postgres
if [ ! -f .env ]; then
  umask 077
  printf 'POSTGRES_USER=melomio\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=melomio_dev\n' "$(openssl rand -hex 24)" > .env
  chown deploy:deploy .env
fi

cat > init/01-test-db.sql <<'EOF'
CREATE DATABASE melomio_test OWNER melomio;
EOF

cat > compose.yaml <<'EOF'
services:
  postgres:
    image: postgres:18
    restart: unless-stopped
    env_file: .env
    ports:
      - "127.0.0.1:5432:5432"   # nur intern, nie aus dem Internet erreichbar
    volumes:
      - pgdata:/var/lib/postgresql
      - ./init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U melomio -d melomio_dev"]
      interval: 10s
      timeout: 5s
      retries: 10
volumes:
  pgdata:
EOF
chown -R deploy:deploy /opt/melomio
# Der Container-Benutzer "postgres" muss das Init-Skript lesen dürfen
chmod 755 /opt/melomio/postgres/init
chmod 644 /opt/melomio/postgres/init/*.sql

docker compose up -d
echo "Warte auf PostgreSQL ..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U melomio -d melomio_dev >/dev/null 2>&1; then
    echo "PostgreSQL bereit."; break
  fi
  sleep 2
done
docker compose exec -T postgres psql -U melomio -d melomio_dev -Atc "select version();"
docker compose exec -T postgres psql -U melomio -d melomio_dev -Atc "select datname from pg_database where datname like 'melomio%' order by 1;"

echo "== Fertig (Schritt 1). Neustart nötig: $( [ -f /var/run/reboot-required ] && echo ja || echo nein ) =="
