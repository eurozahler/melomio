# Überträgt den aktuellen Programmstand (letzter Commit) auf den Testserver, baut dort das Image
# und startet Webseite + Worker neu. Aufruf im Projektordner:  .\scripts\testserver-deploy.ps1
# Voraussetzung: 03-app-vorbereiten.sh wurde auf dem Server ausgeführt (siehe infra/testserver/README.md).
$ErrorActionPreference = "Stop"

$commit = (git rev-parse --short HEAD).Trim()
if (git status --porcelain) { Write-Warning "Es gibt nicht committete Änderungen – übertragen wird nur Commit $commit." }

$archive = Join-Path $env:TEMP "melomio-$commit.tar"
git archive --format=tar -o $archive HEAD
Write-Host "Übertrage Commit $commit ..."
scp $archive melomio-test:/tmp/melomio-src.tar
scp infra/testserver/app/compose.yaml infra/testserver/app/Caddyfile melomio-test:/opt/melomio/app/
Remove-Item $archive

$remote = @(
  "set -e",
  "rm -rf /opt/melomio/app/src",
  "mkdir -p /opt/melomio/app/src",
  "tar -xf /tmp/melomio-src.tar -C /opt/melomio/app/src",
  "rm /tmp/melomio-src.tar",
  "cd /opt/melomio/app/src",
  "docker build -t melomio-app:latest --label commit=$commit .",
  "cd /opt/melomio/app",
  "docker compose up -d --remove-orphans",
  "docker compose ps",
  "docker image prune -f >/dev/null"
) -join " && "
ssh melomio-test $remote
Write-Host "Fertig: Commit $commit läuft auf dem Testserver."
