# Öffnet einen sicheren SSH-Tunnel zur Datenbank auf dem Hetzner-Testserver.
# Danach ist PostgreSQL auf diesem PC unter localhost:5433 erreichbar.
# Fenster offen lassen, solange entwickelt wird. Beenden mit Strg+C.
#
# Voraussetzung: Eintrag "Host melomio-test" in %USERPROFILE%\.ssh\config

Write-Host "Tunnel zur Datenbank wird geöffnet: localhost:5433 -> melomio-test" -ForegroundColor Cyan
Write-Host "Zum Beenden Strg+C drücken." -ForegroundColor DarkGray
ssh -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -L 5433:127.0.0.1:5432 melomio-test
