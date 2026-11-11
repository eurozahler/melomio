# Livegang-Checkliste (C10)

Stand: 10.11.2026. Diese Liste wird von oben nach unten abgearbeitet. **Nichts davon passiert ohne
ausdrückliche Freigabe.** ⚠️ = von mir nicht geprüft, bitte bestätigen.

## A. Recht und Verträge (vor allem anderen)

- [ ] **Rechtstexte juristisch prüfen lassen:** Impressum, AGB, Datenschutz, Widerrufsbelehrung
  (`/impressum`, `/agb`, `/datenschutz`, `/widerruf`), dazu die beiden Kauf-Haken
  (`src/domain/consents.ts`) und die Bestellbestätigung (`src/server/email/templates.ts`).
  Danach den Hinweis „Entwurf“ entfernen (`src/legal/legal-page.tsx`, `LEGAL_VERSION`) und die
  Fassungen der Kauf-Haken hochzählen.
- [ ] **Nutzungsbedingungen der KI-Anbieter prüfen:** Mureka (kommerzielle Nutzung und
  Weiterverkauf an Endkunden), Anthropic (kommerzielle Nutzung der Texte).
- [ ] **Auftragsverarbeitungsverträge (AVV)** abschließen bzw. akzeptieren: Hetzner, Strato,
  Mollie, Anthropic, Mureka. ⚠️ Für Anthropic und Mureka: Datenübermittlung außerhalb der EU
  (Standardvertragsklauseln) klären.
- [ ] **Steuerberater:** Rechnungsbild (PDF) und CSV-Export ansehen lassen.
- [ ] Mindestalter, Speicherfristen und Nutzungsrechte bestätigen (siehe Fragenliste).

## B. Konten und Zahlungen

- [ ] **Mollie:** Firmenprüfung abgeschlossen, Website-Profil freigegeben, **Live-Schlüssel** (`live_…`).
- [ ] **Mureka:** Paket für den Livebetrieb kaufen (Basic: 5 gleichzeitige Aufträge).
- [ ] **Anthropic:** eigener Schlüssel für den Livebetrieb, Ausgabenlimit in der Konsole setzen.
- [ ] **Hetzner Object Storage** (entschieden 11.11.): Bucket `melomio-live` (privat) und Zugangsschlüssel
  anlegen, `STORAGE_PROVIDER=s3` (ca. 5 €/Monat inkl. 1 TB ≈ 30.000 Bestellungen à 25–40 MB).
- [ ] **Hetzner Storage Box** (entschieden 11.11.) für Sicherungen außer Haus; `BACKUP_REMOTE` setzen.
- [ ] **UptimeRobot** (entschieden 11.11., kostenlos): Monitor „HTTP(s)“ auf `https://melomio.de/api/health`,
  Intervall 5 Min., Alarm an info@eurozahler.de.
- [ ] **Dropbox-App** für EasyGMV: https://www.dropbox.com/developers/apps → „Create app“ → „Full Dropbox“
  (oder „App folder“, wenn EasyGMV dort lesen kann) → Rechte `files.content.write`,
  `files.content.read`, `account_info.read` → Redirect-URI `https://melomio.de/api/admin/dropbox/callback`.
  App key/secret als `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET`, `PUBLISH_PROVIDER=dropbox`; danach im Admin
  unter „Veröffentlichungen“ auf „Mit Dropbox verbinden“ klicken und je Anlass den Ordner eintragen.
- [ ] **Strato:** DKIM aktivieren; klären, ob das Postfach für größere E-Mail-Mengen freigeschaltet
  werden muss.

## C. Produktionsserver

Empfehlung: **eigener Server** für den Livebetrieb (Testserver bleibt für Tests).

1. [ ] Server bei Hetzner anlegen, Firewall wie beim Testserver (22/80/443).
2. [ ] Einrichtung wie beim Testserver: `infra/testserver/01-setup.sh`, `02-harden-ssh.sh`.
3. [ ] Datenbank mit **neuem** Passwort; `BETTER_AUTH_SECRET` **neu** erzeugen.
4. [ ] `.env` nach `infra/produktion/env.vorlage`; Geheimnisse mit `schluessel-eintragen.sh`.
5. [ ] Caddy mit `infra/produktion/Caddyfile` (ohne Passwortschutz, www → ohne www).
6. [ ] Programm übertragen (`scripts/testserver-deploy.ps1` mit Ziel Produktionsserver).
7. [ ] Admin-Konto anlegen und Rolle vergeben (`scripts/admin/grant-role.ts`).
8. [ ] Admin → **Firma** vollständig ausfüllen (sonst ist kein Kauf möglich).
9. [ ] Admin → **Einstellungen:** „Hörproben pro Konto“ (Vorschlag 1), Tagesbudget, Preis.
10. [ ] **Sicherung:** `infra/backup/backup.sh` + `cron-einrichten.sh`, einmal
    `restore-test.sh` ausführen. Außer-Haus-Kopie (Storage Box) einrichten.
11. [ ] **Überwachung:** externen Uptime-Dienst auf `https://melomio.de/api/health` richten
    (meldet 503, wenn Datenbank oder Worker ausfallen). `ALERT_EMAIL=info@eurozahler.de` setzen.

## D. Umschalten (Domain)

- [ ] Bei Strato die A-Records von `melomio.de` und `www.melomio.de` auf die IP des
  Produktionsservers setzen. ⚠️ Die bisherige Strato-Seite ist danach nicht mehr erreichbar.
- [ ] Warten, bis Caddy die Zertifikate geholt hat (Protokoll: `docker compose logs caddy`).

## E. Abnahme im Livebetrieb

- [ ] Echte Bestellung mit kleinem Betrag (z. B. Preis vorübergehend 1 €) komplett durchlaufen:
  Fragebogen → Songtext → Hörprobe → Kauf → Song, Video, Rechnung, E-Mails.
- [ ] Diese Bestellung im Admin **erstatten** → Geld zurück, Stornorechnung, Downloads gesperrt.
- [ ] Preis wieder auf den echten Wert setzen.
- [ ] Startseite, Rechtstexte und Footer am Handy prüfen.
- [ ] `npm audit` erneut prüfen.

## F. Nach dem Start (erste Woche)

- [ ] Täglich Admin-Übersicht: Lebenszeichen des Workers, „Braucht Aufmerksamkeit“, Kosten.
- [ ] Sicherungen kontrollieren (`/opt/melomio/backups/backup.log`).
- [ ] Mureka-Guthaben und Anthropic-Kosten beobachten.
