# Entwicklungsplan

Stand: 08.11.2026 (2. Fassung) · Status: **freigegeben am 08.11.2026**, Umsetzung läuft (aktuell: M0)

Die Umsetzung ist in kleine **Module** aufgeteilt. Jedes Modul endet mit einem **überprüfbaren Ergebnis**: etwas, das du selbst im Browser ansehen kannst, und automatische Tests, die grün sein müssen. Erst wenn ein Modul abgenommen ist, beginnt das nächste.

**Regeln für die gesamte Umsetzung**
- Zugangsdaten nur in Umgebungsvariablen (`.env.local`), nie im Code und nie in Git.
- **Kostenpflichtige API-Aufrufe** (z. B. eine echte Musikgenerierung) erst nach deiner ausdrücklichen Freigabe.
- Kein Produktivbetrieb (Livegang) ohne deine Freigabe und ohne juristische Prüfung.
- Jedes Modul wird mit Git festgehalten, damit es sich zurückverfolgen lässt.

**Neuer Ablauf aus Kundensicht** (Entscheidungen E10–E17):
```
Anlass wählen → Fragebogen (ohne Konto) → Genre/Stimmung/Stimme
→ Anmelden/Registrieren → Songtext entsteht → prüfen, bearbeiten, freigeben
→ Musik entsteht → 20-Sekunden-Hörprobe mit Wasserzeichen
→ Checkout mit Widerrufsverzicht → Zahlung
→ ganzer Song + Video + teilbare Song-Seite mit QR-Code
```

---

## Erste Version: „Von der Bestellung bis zum Song-Download“ (Module M0–M11)

Ohne echte Zugänge läuft alles im **gekennzeichneten Testbetrieb** (siehe `ARCHITEKTUR.md`, Abschnitt 4).

### M0 – Arbeitsumgebung einrichten
- Auf deinem PC: Node.js (LTS) und Git installieren. VS Code ist schon vorhanden.
- Git im Ordner `C:\dev\songgen` einrichten, Sicherung über ein privates GitHub-Repository.
- In deiner Hetzner Cloud: einen kleinen **Testserver** anlegen (ca. 5 € im Monat, ⚠️ Preis nicht geprüft) mit PostgreSQL. Die Datenbank ist von außen nicht erreichbar; dein PC verbindet sich über einen sicheren SSH-Tunnel. Ich führe dich Schritt für Schritt durch.
- Optional: kostenloses Mollie-Konto für den Testmodus.
- **Ergebnis:** `node --version` und `git --version` funktionieren. Vom PC aus ist die Testdatenbank erreichbar.

### M1 – Projektgrundgerüst und Konfiguration
- Next.js + TypeScript (strenger Modus), Tailwind, next-intl (Deutsch), Lint- und Format-Regeln.
- Prüfung der Umgebungsvariablen mit Zod, `.env.example`, **Testbetrieb-Banner** und **Startsperre** für den Livemodus mit Mocks.
- **Ergebnis:** `npm run dev` zeigt eine Startseite mit dem Banner „TESTBETRIEB“.
- **Tests:** Die App startet nicht mit `APP_MODE=live` und einem Mock-Provider. Fehlende Variablen erzeugen eine verständliche Fehlermeldung.

### M2 – Datenbank und Migrationen
- Drizzle-Schema für die Tabellen der ersten Version (in `ARCHITEKTUR.md` Abschnitt 10 fett markiert), Migrationen, Seed-Daten: 3 Anlässe (Geburtstag, Liebe, Hochzeit) mit Beispielfragen, 6 Genres, 4 Stimmungen, 4 Stimmbeschreibungen, ein Preis.
- **Ergebnis:** `npm run db:migrate` und `npm run db:seed` laufen auf einer leeren Datenbank durch.
- **Tests:** Integrationstest gegen die Testdatenbank. Ein Preis-Snapshot lässt sich nach dem Anlegen nicht mehr verändern.

### M3 – Landingpage, Fragebogen, Auswahl
- Einfache Landingpage (Anlässe, Hörbeispiele-Platzhalter, „Hörprobe gratis“, FAQ-Platzhalter).
- Dynamischer Fragebogen mit bedingten Folgefragen. Er lässt sich ohne Anmeldung ausfüllen; der Fortschritt wird als Entwurf gespeichert. Diktat über die Smartphone-Tastatur funktioniert automatisch.
- Auswahl von Genre, Stimmung, Stimme und Songsprache. Option „Ich schreibe den Songtext selbst“.
- **Ergebnis:** Am Handy einen Fragebogen ausfüllen, die Seite neu laden: Die Antworten sind noch da.
- **Tests:** Unit-Tests für die Bedingungslogik. End-to-End-Test „Fragebogen ausfüllen“ in Handy-Größe.

### M3b – Kundenkonto
- Registrierung und Anmeldung über eine Login-Bibliothek in der App (Vorschlag: **Better Auth**, Daten in der eigenen PostgreSQL-Datenbank). E-Mail-Bestätigung, „Passwort vergessen“, optional Login per E-Mail-Link (→ F-16). Seite „Meine Songs“.
- **Die Anmeldung kommt nach dem Fragebogen und vor dem Songtext** (E11). Der Entwurf wird dem Konto zugeordnet.
- Im Testbetrieb landen die E-Mails im Test-Postfach. Für den Livebetrieb wird ein Postfach deiner Strato-Domain per SMTP angebunden.
- **Ergebnis:** Fragebogen ausfüllen → registrieren → E-Mail im Test-Postfach bestätigen → Antworten sind im Konto.
- **Tests:** Ohne bestätigte E-Mail entsteht kein Songtext. Kunde A sieht die Songs von Kunde B nicht.

### M4 – Hintergrundaufträge und Statusmaschine
- pg-boss, eigener Worker-Prozess (`npm run worker`), Statusmaschine der Bestellung mit Historie (neuer Ablauf, siehe `ARCHITEKTUR.md` Abschnitt 7), Wiederholungsregeln.
- **Ergebnis:** Nach dem Absenden des Fragebogens wechselt der Status sichtbar automatisch weiter. Den Worker stoppen und neu starten: Er macht dort weiter, wo er aufgehört hat.
- **Tests:** Unerlaubte Statussprünge werden abgelehnt (z. B. `preview_ready → video_rendering` ohne Zahlung). Ein wiederholter Auftrag mit gleichem Idempotenzschlüssel läuft nicht doppelt.

### M5 – Songtext erzeugen, prüfen, freigeben
- `LyricsProvider` mit **Mock** und **Anthropic Claude** (strukturierte Ausgabe, Prompt aus `prompt_versions`).
- Filter gegen Künstlernamen und fremde Songtexte in den Eingaben.
- Prüfseite: Text vollständig ansehen, **selbst bearbeiten (unbegrenzt)**, **„KI neu formulieren lassen“** (Standard 1-mal, Limit in `app_settings`), freigeben (Vorschlag F-18).
- **Ergebnis:** Nach der Anmeldung erscheint ein Songtext. Korrigieren, freigeben, danach startet die Musik.
- **Tests:** Das Limit für KI-Neuformulierungen greift. Ein fremdes Konto sieht den Songtext nicht. Nach der Freigabe ist der Text nicht mehr änderbar (die Musik basiert darauf).

### M6 – Musik erzeugen, prüfen, Hörprobe
- `MusicProvider`-Interface, **Mock-Adapter** (Test-Tonfolge mit „Gesangsteil“ in der Mitte, simulierte Wartezeit, einstellbare Fehlerquote).
- **Vor der Zahlung 1 Kandidat** (einstellbar). Technische Qualitätsprüfung mit FFmpeg: Datei lesbar, Dauer im erlaubten Bereich, keine langen Stillen. Unsichere Fälle gehen auf „manuelle Prüfung“.
- **Hörprobe:** Der Server schneidet **20 Sekunden** heraus, beginnend an der Gesangsstelle (→ F-19, Ersatzwert aus dem Admin), mit Ein- und Ausblenden und **hörbarem Wasserzeichen**. Nur diese Datei wird an den Browser ausgeliefert.
- **Missbrauchsschutz:** Hörproben pro Konto (Standard 1), Tagesbudget für alle Hörproben, Rate Limits. Ist das Budget erreicht, gibt es eine freundliche Meldung statt einer Hörprobe.
- **Echter Adapter** (z. B. ElevenLabs) erst, wenn die Lizenzfrage geklärt ist **und** du den ersten kostenpflichtigen Aufruf freigibst. Parallel möglich: **Hörtest** ElevenLabs gegen ACE-Step.
- **Ergebnis:** Nach der Freigabe des Songtexts erscheint eine 20-Sekunden-Hörprobe mit Wasserzeichen im Browser.
- **Tests:** **Die vollständige Audiodatei ist vor der Zahlung über keinen Weg abrufbar** (neues Abnahmekriterium, E12). Das Limit pro Konto greift. Eine stumme Datei fällt in der Prüfung durch. Ein fehlgeschlagener Auftrag wird wiederholt, ohne einen fertigen Kandidaten neu zu erzeugen.

### M7 – Checkout und Zahlung
- Checkout direkt unter der Hörprobe. Gesamtpreis inkl. MwSt. (Preis aus dem Admin, E13).
- Pflicht-Haken, **nicht vorangekreuzt** (E16):
  1. AGB und Datenschutz.
  2. „Ich verlange ausdrücklich, dass mit der Ausführung sofort begonnen wird, und weiß, dass ich dadurch mein Widerrufsrecht verliere.“ (⚠️ Wortlaut vom Anwalt)
- Speicherung in `consents` mit Textversion und Zeitpunkt. **Bestätigungs-E-Mail** mit Vertragsinhalt und Hinweis auf den Verzicht.
- `PaymentProvider` mit **Mock** und **Mollie** (Testschlüssel). Webhook mit Statusabruf, Idempotenz und Ereignisprotokoll.
- **Ergebnis:** Hörprobe → Haken setzen → Testzahlung → Status „bezahlt“ → Video wird erzeugt.
- **Tests:** Ohne beide Haken keine Zahlung. Doppelter Webhook bewirkt nur eine Verarbeitung. Webhook mit erfundener ID bewirkt keine Statusänderung. Abgebrochene Zahlung führt nicht zu „bezahlt“.

### M8 – Standardvideo
- FFmpeg-Vorlage: 1080×1920 (9:16), H.264/AAC, animierter Farbverlauf, Songtitel. Im Testbetrieb mit Wasserzeichen „TEST“.
- Wird erst **nach der Zahlung** erzeugt.
- **Ergebnis:** Zu jedem bezahlten Song gibt es ein MP4-Video, das am Handy abspielbar ist.
- **Tests:** Automatische Prüfung mit `ffprobe`: Auflösung, Codecs, Videolänge entspricht der Songlänge.

### M9 – Auslieferung, Download und Song-Seite
- Seite „Mein Song“ im Kundenkonto mit Player, Songtext, MP3- und MP4-Download über kurzlebige, signierte Links.
- **Teilbare Song-Seite** (E17): eigener, schwer zu erratender Link mit Player und Songtext, ohne Anmeldung abrufbar, **QR-Code** zum Herunterladen. Der Kunde kann sie jederzeit abschalten.
- E-Mail „Dein Song ist fertig“. Im Testbetrieb im Test-Postfach.
- **Ergebnis:** Link aus dem Test-Postfach öffnen, Song und Video herunterladen, die Song-Seite am Handy per QR-Code öffnen.
- **Tests:** Ohne Anmeldung kein Download aus dem Konto. Ein fremdes Konto bekommt keinen Download-Link. Eine abgeschaltete Song-Seite ist nicht mehr erreichbar. Abgelaufene Datei-Links funktionieren nicht.

### M10 – Basis-Admin
- Login, Rollen Owner/Admin.
- Bestellliste mit Filter (Status, Testbestellung, „Hörprobe ohne Kauf“), Bestelldetail mit Historie, Songtext, Kandidaten, Hörprobe, Video, Aktion „Schritt wiederholen“.
- Einstellungen: Preis, Korrekturen, Neuversuche, Kandidaten (vor/nach Zahlung), Länge und Startpunkt der Hörprobe, Hörproben pro Konto, Tagesbudget, Linklaufzeit. Jede Änderung wird im Audit-Log festgehalten.
- Kennzahlen: Hörproben heute, Käufe, **Kaufquote** (Käufe ÷ Hörproben), geschätzte Kosten der Hörproben.
- **Ergebnis:** Als Admin einloggen, den Preis ändern, eine fehlgeschlagene Testbestellung wiederholen, die Kaufquote sehen.
- **Tests:** Ohne Login gibt es keinen Zugriff. Einstellungsänderungen erscheinen im Audit-Log.

### M11 – Gesamttest der ersten Version und Testserver
- End-to-End-Test des gesamten Ablaufs in Handy-Größe (Playwright), Barrierefreiheitsprüfung (axe), `npm audit`, kurze Bedienungsanleitung für den Testbetrieb.
- Die erste Version läuft zusätzlich auf dem **Hetzner-Testserver**, im Testbetrieb und mit Passwortschutz, damit du sie am Handy ausprobieren kannst.
- **Ergebnis:** `npm run test:e2e` spielt den kompletten Weg durch, und du kannst ihn selbst auf dem Testserver ausprobieren.

---

## Danach: Phase C – Ausbau (Reihenfolge nach Absprache)
| Modul | Inhalt |
|---|---|
| C1 | Echte E-Mails, Zustellprotokoll |
| C2 | Foto-Upload (Validierung, Virenscan, Metadaten entfernen) und synchronisierte Slideshow |
| C3 | Songtext im Video, zeitlich synchron (Verfahren abhängig vom Musikanbieter) |
| C4 | Konto-Ausbau: Profil, Konto löschen, Datenexport |
| C5 | Gutscheine, mehrere Steuersätze, Rechnungen/Belege |
| C6 | Ausführlicher Admin: Fragebogen-Builder, Prompt-Verwaltung mit Test und Rollback, Dashboard (Umsatz, Kosten, Fehlerraten) |
| C7 | **Veröffentlichung über EasyGMV:** Einwilligung (Fotos nur mit Bestätigung, sonst Fassung ohne Fotos), Admin-Freigabe, „Mit Dropbox verbinden“, **Ordner pro Anlass oder ein gemeinsamer Ordner** (E14), Upload in den Ordner |
| C8 | Rückerstattungsablauf (Gewährleistung), Lösch- und Exportanfragen (DSGVO), Aufbewahrungsfristen, automatisches Löschen von Hörproben ohne Kauf |
| C9 | Monitoring: Fehlertracking, Kosten- und Warteschlangen-Überwachung, Alarme |
| C10 | Livebetrieb auf Hetzner: Produktionsserver, Backups, Domain von Strato auf Hetzner zeigen lassen, Livegang-Checkliste (rechtliche Texte, AV-Verträge, Lasttest) |
| C11 | **Trauer: Vorlage „Abschiedsvideo“** (E15): ein Foto in Schwarz-Weiß, Name, geboren/verstorben, Spruch, Aufruf zum Teilen („… auf eine letzte Reise um die Welt schicken“). Eigene Fragen im Fragebogen (Daten, Spruch), ausdrückliche Beauftragung der Veröffentlichung, Pflicht zur Admin-Freigabe. Braucht C2 und C7. |

## Phase D – Skalierung
Englisch aktivieren, echter Sprachdialog, weitere Musikanbieter mit automatischem Ausweichen (Failover), weitere Videoformate, **A/B-Tests und kleine Umfragen** (z. B. zur Zahl der Korrekturen, F-18), Rabatt für Veröffentlichung (F-20), **Plakette mit QR-Code** als Druckprodukt, Kostenoptimierung.

---

## Grobe Kostenschätzung (nur zur Orientierung, ⚠️ nicht verifiziert)

| Posten | Schätzung |
|---|---|
| Songtext (Claude, inkl. Korrekturen) | 0,02–0,10 $ pro Hörprobe |
| Musik für die Hörprobe, 1 Kandidat à 3 min | ElevenLabs Scale: ca. 0,45 $ **plus 299 $/Monat Grundgebühr** · Lyria: ca. 0,08 $ |
| Zweiter Kandidat nach dem Kauf (optional) | wie oben |
| Video-Rendering, Speicher, E-Mail | wenige Cent |
| Hetzner Cloud (Produktion + Testserver + Object Storage) | grob 15–40 € im Monat |
| Mollie-Gebühr | ⚠️ nicht geprüft |

**Wichtig wegen der Hörprobe:** Kosten entstehen pro Hörprobe, nicht pro Kauf. Beispiel mit ElevenLabs bei einer Kaufquote von 25 %: Pro Verkauf fallen etwa 4 Hörproben an, also ca. 2 $ Musikkosten. Bei einem höheren Preis (E13) ist das gut tragbar. Die Kaufquote siehst du im Admin (M10).
