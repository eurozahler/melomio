#!/usr/bin/env bash
# SSH absichern: keine root-Anmeldung, keine Passwörter. Nur nach erfolgreichem Test von "deploy" ausführen.
set -euo pipefail
cat > /etc/ssh/sshd_config.d/10-melomio.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sshd -t
systemctl restart ssh
sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication) '
