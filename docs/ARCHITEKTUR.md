# Architektur – KI-Song-Plattform

Stand: 08.11.2026 (2. Fassung: Hetzner, Hörprobe vor der Zahlung) · Status: **Vorschlag, wartet auf Freigabe**
Grundlage: `Pflichtenheft_KI_Song_Plattform_Claude_Code.md` (Version 1.0)

Diese Datei erklärt, *wie* die Plattform technisch aufgebaut werden soll und *warum*. Begriffe, die für Einsteiger neu sein könnten, sind kurz erklärt.

---

## 1. Überblick in einem Bild

```
                 ┌──────────────────────────────────────────────┐
  Kunde (Handy)  │  WEB-APP  (Next.js, TypeScript)              │
  ─────────────▶ │  • Seiten: Landing, Fragebogen, Checkout,    │
  Admin (Browser)│    Songtext-Prüfung, Downloads, Admin        │
                 │  • API-Routen: Webhooks (Mollie), Uploads    │
                 └───────┬───────────────────────┬──────────────┘
                         │ liest/schreibt        │ legt Aufträge ab
                         ▼                       ▼
                 ┌────────────────┐     ┌────────────────────────┐
                 │  PostgreSQL    │◀────│  WARTESCHLANGE (Queue) │
                 │  (Datenbank)   │     │  pg-boss, liegt in der │
                 └────────────────┘     │  gleichen Datenbank    │
                         ▲              └──────────┬─────────────┘
                         │                         │ holt Aufträge ab
                         │              ┌──────────▼─────────────┐
                         └──────────────│  WORKER (Node-Prozess) │
                                        │  • Songtext (LLM)      │
                                        │  • Musik (Provider)    │
                                        │  • Qualitätsprüfung    │
                                        │  • Video (FFmpeg)      │
                                        │  • E-Mail, Dropbox     │
                                        └──────────┬─────────────┘
                                                   │ speichert Dateien
                                        ┌──────────▼─────────────┐
                                        │  PRIVATER DATEISPEICHER│
                                        │  (Fotos, MP3, MP4)     │
                                        │  nur über signierte,   │
                                        │  ablaufende Links      │
                                        └────────────────────────┘

  Externe Dienste (über austauschbare „Adapter“):
  Mollie (Zahlung) · LLM (Songtext) · Musik-KI · E-Mail · Dropbox
```

**Die Grundidee:** Die Web-App beantwortet nur schnelle Anfragen. Alles, was lange dauert (Songtext schreiben, Musik erzeugen, Video rendern), legt sie als Auftrag in eine Warteschlange. Ein separater **Worker** arbeitet diese Aufträge im Hintergrund ab. Die Kundin oder der Kunde sieht in der Zwischenzeit eine Fortschrittsanzeige.

> **Warum nicht alles in der Web-App?** Eine Musikgenerierung kann Minuten dauern. Webanfragen werden aber nach wenigen Sekunden abgebrochen, und Hosting-Anbieter beenden langlaufende Anfragen. Ein Worker kann dagegen beliebig lange arbeiten, nach einem Absturz weitermachen und fehlgeschlagene Schritte wiederholen.

---

## 2. Technologie-Auswahl und Begründung

| Bereich | Vorschlag | Warum (einfach erklärt) |
|---|---|---|
| Sprache | **TypeScript** | JavaScript mit Typprüfung. Viele Fehler fallen schon beim Schreiben auf statt erst beim Kunden. Vom Pflichtenheft vorgegeben. |
| Web-Framework | **Next.js** (App Router) | Frontend und Backend in einem Projekt. Weit verbreitet, gut dokumentiert. Vom Pflichtenheft vorgegeben. |
| Oberfläche | **Tailwind CSS** + **shadcn/ui** | Fertige, barrierearme Bausteine (Buttons, Formulare). Mobil zuerst gestaltet. |
| Mehrsprachigkeit | **next-intl** | Alle Texte stehen in Sprachdateien. Deutsch zuerst, Englisch kann später ohne Umbau dazukommen. |
| Datenbank | **PostgreSQL** auf einem eigenen Server in der **Hetzner Cloud** (Deutschland) | Bewährte, kostenlose Datenbank. Alle Daten bleiben bei einem deutschen Anbieter (Entscheidung E10). Supabase wird nicht verwendet. |
| Datenbankzugriff | **Drizzle ORM** + SQL-Migrationen | Tabellen werden in TypeScript beschrieben. Änderungen werden als nachvollziehbare Migrationsdateien gespeichert. |
| Eingabeprüfung | **Zod** | Prüft jede Eingabe (Formulare, Webhooks, Umgebungsvariablen) gegen ein festes Schema. |
| Login | **Better Auth** (Vorschlag; Alternative: Auth.js) | Eine Login-Bibliothek, die direkt in der App läuft und die Benutzer in der eigenen Datenbank speichert. Kein externer Dienst nötig. Für Admins und Kunden. **Bestellen geht nur mit Kundenkonto** (E5). Den Fragebogen kann man ohne Anmeldung ausfüllen; **die Anmeldung kommt vor dem Songtext** (E11), und der Entwurf wird dann dem Konto zugeordnet. Anmelde-E-Mails laufen über ein Strato-Postfach (SMTP). |
| Warteschlange | **pg-boss** | Speichert die Aufträge in der vorhandenen PostgreSQL-Datenbank. Es wird **kein zusätzlicher Dienst** (wie Redis) gebraucht. Wiederholungen und Zeitpläne sind eingebaut. |
| Video/Audio | **FFmpeg** als installiertes Programm (PC: winget `Gyan.FFmpeg`, Server: Ubuntu-Paket `ffmpeg`), Pfad über `FFMPEG_PATH`/`FFPROBE_PATH` | Das Standardwerkzeug für Audio und Video. Entscheidung M6: kein npm-Paket `ffmpeg-static` – es müsste beim Installieren ein Programm nachladen (npm blockiert das standardmäßig), und das System-Paket lässt sich leichter aktualisieren. FFmpeg läuft als eigenes Programm, Argumente werden als Liste übergeben (kein Einschleusen von Befehlen). |
| Dateispeicher | **Hetzner Object Storage** (S3-kompatibel, private Buckets) | Dateien sind nie öffentlich. Zugriff gibt es nur über signierte Links, die nach einer festgelegten Zeit ablaufen. Weil die Schnittstelle dem Standard „S3“ folgt, ließe sich der Speicher später ohne Umbau wechseln. ⚠️ Preise und Funktionen vor M9 prüfen. |
| Tests | **Vitest** (Unit/Integration), **Playwright** (End-to-End, Mobilansicht), **axe** (Barrierefreiheit) | Jedes Modul bekommt automatische Tests als Abnahmenachweis. |

### Hosting: Hetzner Cloud (Entscheidung E10)

| Server | Zweck | Wann |
|---|---|---|
| **Testserver** (klein) | PostgreSQL für die Entwicklung; ab M11 auch die Testversion der App mit Passwortschutz | ab M0 |
| **Produktionsserver** | Web-App, Worker (inkl. FFmpeg) und PostgreSQL. Bei mehr Last kann der Worker später auf einen eigenen Server ziehen. | ab C10 (Livegang) |
| **Object Storage** | Hörproben, Songs, Videos, Fotos (privat) | ab M9 |

- Alles läuft in **Docker-Containern** (per Docker Compose). Davor sitzt ein Webserver (Caddy), der automatisch HTTPS-Zertifikate besorgt.
- **Datenbank-Port nie offen ins Internet.** Zugriff vom PC nur über einen SSH-Tunnel. Firewall der Hetzner Cloud: nur die Ports 22 (SSH, nur mit Schlüssel), 80 und 443.
- **Backups:** tägliche Datenbanksicherung (`pg_dump`) in den Object Storage, zusätzlich die Server-Backups von Hetzner. Eine Wiederherstellung wird vor dem Livegang einmal geprobt.
- Reine „Serverless“-Plattformen wären **nicht** geeignet, weil FFmpeg-Renderings und Musik-Aufrufe zu lange dauern. Ein eigener Server hat dieses Problem nicht.
- ⚠️ **Eigene Musik-KI (ACE-Step):** Nach meinem Stand bietet die Hetzner Cloud keine Server mit Grafikkarte an (Hetzner hat dedizierte GPU-Server mit Monatsmiete, die gehören aber nicht zur Cloud). Nicht geprüft. Für einen Hörtest wäre ein stundenweise gemieteter GPU-Rechner bei einem anderen Anbieter nötig.

**Strato:** bleibt für **Domain und E-Mail-Postfächer**. Im DNS bei Strato wird die Domain (bzw. eine Subdomain) auf den Hetzner-Server gelenkt. Die E-Mail bleibt unverändert bei Strato.

---

## 3. Austauschbare Anbieter („Adapter“)

Jeder externe Dienst wird hinter einer **Schnittstelle** (Interface) versteckt. Der restliche Code kennt nur die Schnittstelle und nicht den konkreten Anbieter. So lässt sich ein Anbieter wechseln, ohne die Plattform umzubauen. Außerdem kann jeder Anbieter durch einen **Test-Adapter (Mock)** ersetzt werden.

| Schnittstelle | Methoden (vereinfacht) | Test-Adapter | Echte Adapter (Kandidaten) |
|---|---|---|---|
| `PaymentProvider` | `createPayment`, `getPayment`, `createRefund` | `mock` (Zahlung per Klick bestätigen) | Mollie (zuerst im Testmodus) |
| `LyricsProvider` (LLM) | `generate`, `revise` | `mock` (Vorlagentext aus den Antworten) | Anthropic Claude: Claude Opus 5.5, strukturierte Ausgabe (Titel + Abschnitte), Rückfall-Option bei Ablehnung, gleichbleibender System-Prompt aus `prompt_versions`, Kundenangaben als gekennzeichnete Daten (Schutz vor Prompt-Injection), Künstlernamen werden vorher herausgefiltert |
| `MusicProvider` | `generate` (Adapter wartet intern auf asynchrone Anbieter), `estimateCostCents` | `mock` (erzeugt eine Test-Tonfolge, simuliert Wartezeit und Fehler) | ElevenLabs Music, Google Lyria, Mureka, **eigene KI: ACE-Step auf einem GPU-Server** – **noch nicht freigegeben** (siehe `ANBIETERPRUEFUNG.md`) |
| `VideoRenderer` | `render(template, audio, photos?)` | – (FFmpeg läuft lokal, kostet nichts) | FFmpeg |
| `EmailProvider` | `send` | `console` (E-Mails landen im Log und in einem Test-Postfach unter `/dev/mailbox`) | später: transaktionaler Dienst (offen, F-13) |
| `StorageProvider` | `put`, `getSignedUrl`, `delete` | `local` (Ordner auf dem Rechner) | Hetzner Object Storage (S3) |
| `PublishTarget` (Phase C) | `export(video, metadata)` | `mock` | Dropbox (siehe Abschnitt 12) |

**Umsetzung M6:** Musik-Schritt im Worker (`src/jobs/music.ts`): Kandidaten erzeugen → Prüfung (lesbar, Dauer, Stille; unsicher → manuelle Prüfung) → volle Datei unter `songs/…` speichern → 20-s-Hörprobe ab dem ersten Refrain (Ersatzwert: Prozent der Songlänge) mit Ein-/Ausblenden und hörbarem Signalton unter `previews/…`. Ausgeliefert wird nur die Hörprobe über `/api/hoerprobe/[ref]` (Anmeldung + eigene Bestellung, `no-store`). Für die volle Datei gibt es vor der Zahlung keine Route. Bei Wiederholung werden fertige, geprüfte Kandidaten wiederverwendet. Hörproben-Limit pro Konto und Tagesbudget werden beim Freigeben des Songtexts geprüft und die Hörprobe dabei vorgemerkt (`preview_usage`).

**Asynchrone Musik-Anbieter:** Manche Anbieter liefern sofort eine Datei (ElevenLabs antwortet direkt mit der Audiodatei), andere vergeben eine Auftragsnummer, die abgefragt werden muss (Mureka). Der Adapter gleicht das aus: Der Worker sieht immer dasselbe Muster aus `generate` und anschließend `getStatus`.

---

## 4. Testbetrieb (ausdrücklich gekennzeichnet)

Solange echte Zugänge fehlen, läuft die Plattform im **Testbetrieb**. Er muss jederzeit erkennbar sein und darf nie versehentlich als echter Betrieb laufen.

**Schalter über Umgebungsvariablen:**
```
APP_MODE=test            # test | live
PAYMENT_PROVIDER=mock    # mock | mollie
LYRICS_PROVIDER=mock     # mock | anthropic
MUSIC_PROVIDER=mock      # mock | elevenlabs | lyria | mureka
EMAIL_PROVIDER=console   # console | <dienst>
STORAGE_PROVIDER=local   # local | s3 (Hetzner Object Storage)
```

**Regeln:**
1. **Sichtbares Banner** auf jeder Seite, solange `APP_MODE=test` ist oder ein Mock aktiv ist: „TESTBETRIEB – keine echte Zahlung, kein echter Song“.
2. Jede Bestellung, die im Testbetrieb entsteht, wird in der Datenbank mit `is_test = true` markiert und im Admin deutlich gekennzeichnet.
3. Mock-Audio ist eine erkennbare Test-Tonfolge. Mock-Videos tragen ein Wasserzeichen „TEST“.
4. **Startsperre:** Mit `APP_MODE=live` startet die App nicht, wenn ein Mock aktiv ist oder der Mollie-Schlüssel mit `test_` beginnt. Das prüft ein automatischer Test.
5. Mollie hat einen eigenen Testmodus (Schlüssel `test_…`, simulierte Bezahlseite). Sobald ein kostenloses Mollie-Konto existiert, wird dieser statt des Mocks verwendet. Er ist realistischer und kostet nichts.

---

## 5. Zugangsdaten und Geheimnisse

- **Alle API-Schlüssel stehen ausschließlich in Umgebungsvariablen** (lokal in `.env.local`, später im Secret-Speicher des Hosters). Sie stehen nie im Quellcode, nie in Git und nie im Browser.
- Eine Datei `.env.example` listet alle benötigten Variablen **ohne Werte** auf.
- Beim Start prüft Zod, ob alle nötigen Variablen vorhanden sind. Fehlt eine, bricht der Start mit einer verständlichen Meldung ab.
- Der Admin-Bereich **zeigt nur den Status** an („Musik-Provider: ElevenLabs, konfiguriert, Livemodus“), niemals einen Schlüssel.
- **Es gibt zwei Arten von Zugangsdaten:**
  1. **Feste API-Schlüssel** (Mollie, Musik-KI, Claude, Dropbox-App-Schlüssel). Man kopiert sie einmal aus dem Kundenkonto des Anbieters. Sie stehen **nur in Umgebungsvariablen** auf dem Server. Über die Webseite lassen sie sich weder ansehen noch ändern. Wer sich ins Admin einhackt oder die Datenbank erbeutet, bekommt sie also nicht.
  2. **Verbindungs-Token**, die erst entstehen, wenn ein Admin im Admin-Bereich auf **„Mit Dropbox verbinden“** klickt und sich bei Dropbox anmeldet. Ein solches Token kann man nicht vorher in eine Umgebungsvariable schreiben. Es wird deshalb **verschlüsselt in der Datenbank** gespeichert. Der Schlüssel zum Entschlüsseln (`ENCRYPTION_KEY`) steht wiederum in einer Umgebungsvariable. Die Datenbank allein ist für einen Angreifer also wertlos.
- So funktioniert die Dropbox-Einbindung im Admin wie gewünscht, ohne dass feste Schlüssel in der Datenbank liegen.
- Das Projekt liegt in `C:\dev\songgen`, außerhalb von Qsync (E1). `.env.local` steht in `.gitignore`.
- Auf den Hetzner-Servern stehen die Variablen in einer `.env`-Datei, die nur der Systembenutzer der App lesen darf. Sie wird nie ins Git-Repository übertragen.

---

## 6. Sicherheits- und Datenschutzgrenzen

| Grenze | Maßnahme |
|---|---|
| Browser ↔ Server | Der Browser greift **nie direkt** auf die Datenbank zu. Alle Zugriffe laufen über Server-Code, der Rechte prüft. Jede Datenbankabfrage für Kundendaten filtert zwingend nach dem angemeldeten Konto (zentral in einer Hilfsfunktion, per Test abgesichert). |
| Zahlung | Eine Bestellung gilt **nur** als bezahlt, wenn der Server den Status selbst bei Mollie abgefragt hat. Der Webhook liefert nur die Zahlungs-ID, siehe Abschnitt 8. |
| **Volle Datei vor Zahlung** (E12) | Vor der Zahlung wird nur die **20-Sekunden-Hörprobe** ausgeliefert. Sie wird auf dem Server als eigene Datei geschnitten und mit Wasserzeichen versehen. Die vollständige Audiodatei liegt in einem Bereich des Speichers, für den es erst nach dem Status `paid` signierte Links gibt. Ein Video entsteht erst nach der Zahlung. Prüfung in der Statusmaschine und per Test. |
| Anmeldung | Better Auth: E-Mail + Passwort (E-Mail muss bestätigt sein) und E-Mail-Link (F-16). Höchstens 3 Anmelde-/Registrierungsversuche pro 10 Sekunden und Gerät; im Livebetrieb nicht abschaltbar (Startsperre). Antworten verraten nicht, ob ein Konto existiert. Beim Abmelden wird das Entwurfs-Cookie gelöscht, und ein Entwurf, der einem anderen Konto gehört, wird nie angezeigt (gemeinsam genutzte Geräte). |
| Kosten der Hörproben | Hörproben nur mit bestätigter E-Mail, begrenzte Zahl pro Konto, Tagesbudget für alle Hörproben (Kostenbremse), Rate Limits. Alle Werte im Admin einstellbar. |
| Kundenzugriff | Bestellungen, Songtexte und Downloads sind nur nach Anmeldung sichtbar, und nur für die eigene Bestellung. Links in E-Mails führen zur Anmeldung, nicht direkt zur Datei. Ausnahme: die **teilbare Song-Seite** (E17), die der Kunde selbst einschaltet. Ihr Link enthält eine lange Zufallskennung und lässt sich jederzeit abschalten. |
| Dateien | Private Buckets, signierte Links mit kurzer Laufzeit. Fotos werden nur in den Auftrag der jeweiligen Bestellung übernommen. |
| Uploads | Erlaubt sind nur Bildformate mit Größenlimit. Der Server prüft den Dateityp anhand des Inhalts, nicht nur anhand der Endung. Metadaten (z. B. GPS-Position) werden entfernt. Ein Virenscan folgt in Phase C. |
| Admin | Login ist Pflicht, Rechte werden nach Rollen vergeben (siehe Abschnitt 9). Sensible Änderungen werden im Audit-Log festgehalten. |
| Web-Angriffe | Next.js schützt standardmäßig vor XSS. Zusätzlich: CSRF-Schutz für Formulare, Rate Limits für Bestell-, Upload- und Login-Routen, Sicherheits-Header (Content Security Policy). |
| KI-Anbieter | Es werden nur die nötigen Daten übertragen (Antworten aus dem Fragebogen, keine E-Mail-Adresse). Die Auftragsverarbeitung jedes Anbieters wird vor dem Livegang geprüft. |

---

## 7. Statusmaschinen

Eine **Statusmaschine** legt fest, welche Zustände eine Bestellung haben kann und welche Übergänge erlaubt sind. Unerlaubte Sprünge, zum Beispiel von „Hörprobe fertig“ direkt zu „Video erzeugen“ ohne Zahlung, lehnt der Code ab. Jeder Übergang wird mit Zeitpunkt in `order_status_history` gespeichert.

### Bestellung (`orders.status`), neuer Ablauf mit Hörprobe (E11, E12)
```
draft (Fragebogen, noch ohne Konto)
  │  Anmeldung + E-Mail bestätigt, Hörproben-Limit/Budget geprüft
  ▼
lyrics_generating ──▶ lyrics_review ◀──┐ selbst bearbeiten (unbegrenzt)
  (übersprungen bei       │            │ KI neu formulieren (Limit)
   eigenem Songtext)      ├────────────┘
                          ▼
                    lyrics_approved
                          │
                          ▼
                   music_generating ──▶ manual_review (unsichere QC)
                          │                    │
                          ▼                    │
                    preview_ready ◀────────────┘   20-s-Hörprobe sichtbar
                     │         │
                     │         └──▶ preview_expired (kein Kauf nach X Tagen,
                     ▼                               Dateien werden gelöscht)
              awaiting_payment ──▶ payment_failed / payment_expired
                     │                    (zurück zu preview_ready)
                     ▼
                   paid   ← erst ab hier volle Datei und Video
                     │
                     ▼
              video_rendering
                     │
                     ▼
                 completed ──▶ (refunded)

  Aus jedem Arbeitsschritt möglich: failed (mit Grund) → per Admin „wiederholen“
  Nach completed: Neuversuch Musik (Limit aus app_settings) → music_generating
```

### Hintergrundaufträge (`music_jobs`, `video_jobs` usw.)
`queued → running → succeeded | failed → (retry) → queued`

Jeder Auftrag hat einen **Idempotenzschlüssel**. Das ist ein eindeutiger Name pro Bestellung und Schritt, der verhindert, dass derselbe Schritt doppelt ausgeführt (und doppelt bezahlt) wird, etwa wenn ein Webhook zweimal ankommt oder der Worker abstürzt.

**Umsetzung (M4):**
- Bestellung und Startauftrag entstehen in **einer** Datenbank-Transaktion (pg-boss `send` mit `fromDrizzle(tx)`): nie das eine ohne das andere.
- Tabelle `job_executions`: Schlüssel → Status (läuft / erfolgreich / fehlgeschlagen), Versuchskennung. Ein erfolgreicher Schritt wird nie wiederholt.
- **Absturz des Workers:** Der Worker sendet regelmäßige Lebenszeichen (`heartbeatSeconds: 30`). Bleiben sie aus, gibt pg-boss den Auftrag als neuen Versuch aus; dieser darf den „hängenden“ Schritt übernehmen. Getestet: Absturz mitten im Schritt → nach Neustart in ca. 2–3 Minuten erledigt, nichts doppelt.
- „Läuft schon“ wird nie still als erledigt gewertet, sondern führt zu einem späteren Wiederholungsversuch.
- Nach dem letzten erlaubten Versuch wechselt die Bestellung auf `failed` (mit Grund) und kann im Admin wiederholt werden (M10).
- Zusätzlich prüft jeder Schritt zuerst den Bestellstatus: Passt er nicht, ist der Schritt schon erledigt und tut nichts.
- Statuswechsel nur über `transitionOrder` (Zeile gesperrt mit FOR UPDATE, Eintrag in `order_status_history`). „bezahlt“, Video und „fertig“ setzen eine bestätigte Zahlung (`paid_at`) voraus.
- Höchstens 3 offene, unbezahlte Bestellungen pro Konto (Missbrauchsschutz).
- Täglicher Aufräum-Auftrag (3:30 Uhr): abgelaufene Fragebogen-Entwürfe löschen.

---

## 8. Ablauf der Zahlung (Mollie)

Geprüft anhand der offiziellen Dokumentation (Details in `ANBIETERPRUEFUNG.md`):

1. Der Server erstellt über die **Payments API** eine Zahlung mit Betrag, Beschreibung, `redirectUrl`, `webhookUrl` und Metadaten (`orderId`). Dabei wird der Header `Idempotency-Key` mitgeschickt, damit ein Doppelklick keine zwei Zahlungen anlegt. Die ältere **Orders API wird nicht verwendet**, weil Mollie sie nicht mehr empfiehlt.
2. Der Kunde bezahlt auf der Mollie-Seite und wird zurückgeleitet. Die Rückleitung allein gilt **nicht** als Zahlungsnachweis.
3. Mollie ruft den Webhook auf und schickt dabei **nur die Zahlungs-ID**.
4. Der Server ruft mit dieser ID den echten Status bei Mollie ab. Eine gefälschte Benachrichtigung bewirkt also nichts, weil der Server den Status immer selbst prüft.
5. Jedes Webhook-Ereignis wird in `payment_events` gespeichert. Ist der Status bereits verarbeitet, passiert nichts weiter (Idempotenz).
6. Erst bei `paid` wechselt die Bestellung auf `paid`. Dann werden die volle Audiodatei freigegeben und der Auftrag „Video erzeugen“ angelegt.

**Vor der Zahlung** (E16): zwei Pflicht-Haken, nicht vorangekreuzt: AGB/Datenschutz und „Ich verlange den sofortigen Beginn der Ausführung und weiß, dass ich dadurch mein Widerrufsrecht verliere.“ Beide werden mit Textversion in `consents` gespeichert. Nach der Zahlung geht eine Bestätigungs-E-Mail mit Vertragsinhalt und Hinweis auf den Verzicht raus (dauerhafter Datenträger). ⚠️ Wortlaut vom Anwalt prüfen lassen.

---

## 9. Rollen und Berechtigungen

| Recht | Owner | Admin | Support | Content-Reviewer |
|---|:-:|:-:|:-:|:-:|
| Dashboard, Bestellungen ansehen | ✔ | ✔ | ✔ | ✔ (nur Inhalte) |
| Kundendaten (E-Mail) sehen | ✔ | ✔ | ✔ | ✖ |
| Songtext/Song manuell prüfen, freigeben | ✔ | ✔ | ✖ | ✔ |
| Aufträge wiederholen | ✔ | ✔ | ✔ | ✖ |
| Rückerstattung auslösen | ✔ | ✔ | ✖ | ✖ |
| Preise, Fragen, Genres, Limits ändern | ✔ | ✔ | ✖ | ✖ |
| Prompts ändern, zurückrollen | ✔ | ✔ | ✖ | ✖ |
| Veröffentlichung (Dropbox) freigeben | ✔ | ✔ | ✖ | ✔ |
| Anbieter umschalten, Rollen vergeben | ✔ | ✖ | ✖ | ✖ |
| Lösch-/Exportanfragen ausführen | ✔ | ✔ | ✔ | ✖ |

In der ersten Version gibt es nur **Owner** und **Admin**. Die übrigen Rollen sind im Datenmodell schon vorgesehen.

---

## 10. Datenbankstruktur

Die Tabellen sind nach Bereichen gruppiert. **Fett** markierte Tabellen werden schon für die erste Version gebraucht. *Kursiv* markierte Tabellen fehlen in der Liste des Pflichtenhefts und werden zusätzlich vorgeschlagen.

### 10.1 Benutzer und Zugriff
| Tabelle | Wichtige Spalten | Zweck |
|---|---|---|
| **users** | id, email, email_verified, name, locale, created_at | Admins und Kunden (Login über Better Auth) |
| **sessions**, **accounts**, **verifications** | (Spalten wie von Better Auth vorgegeben) | Anmeldesitzungen, Passwort-Hash (scrypt), Einmal-Tokens für E-Mail-Bestätigung, E-Mail-Link und Passwort-Zurücksetzen |
| *dev_mailbox* | recipient, subject, text, html | Test-Postfach: nur im Testbetrieb (EMAIL_PROVIDER=console), sichtbar unter /dev/mailbox |
| **roles** / *user_roles* | role (owner, admin, support, content_reviewer, customer) | Rollen, die einem Benutzer zugeordnet sind |
| ~~guest_access_tokens~~ | – | **entfällt**, da keine Gastbestellung |
| *questionnaire_drafts* | id, cookie_id, user_id?, answers (JSON), expires_at | Entwurf vor der Anmeldung. Wird beim Login dem Konto zugeordnet und nach Ablauf gelöscht. |

### 10.2 Katalog und Fragebogen
| Tabelle | Wichtige Spalten | Zweck |
|---|---|---|
| **occasions** | slug, name (je Sprache), active, sort | Anlässe: Liebe, Hochzeit, Geburtstag … |
| **questionnaire_versions** | occasion_id, version, published_at | Unveränderliche Fragebogen-Versionen. Eine Bestellung verweist auf genau eine Version. |
| **questions** | version_id, key, type, label, required, sort, condition (JSON) | Fragen einschließlich bedingter Logik, z. B. „zeigen, wenn Frage X = ja“ |
| **question_options** | question_id, value, label | Auswahlmöglichkeiten |
| **genres**, *moods*, **voices** | slug, name, prompt_hint, active | Auswahllisten. `prompt_hint` ist der Text, der an die Musik-KI geht. |
| *products* / *prices* | product, amount_cents, currency, tax_rate_id, valid_from | Preise, die im Admin geändert werden können |
| *tax_rates* | country, rate | Steuersätze |
| *coupons*, *coupon_redemptions* | code, discount, limits | Gutscheine (Phase C) |

### 10.3 Bestellung und Zahlung
| Tabelle | Wichtige Spalten | Zweck |
|---|---|---|
| **orders** | id (UUID), public_ref, status, user_id (Pflicht), locale, occasion_id, questionnaire_version_id, genre/mood/voice, song_language, is_test, created_at | Zentrale Bestellung |
| *order_status_history* | order_id, from, to, reason, actor, at | Nachvollziehbare Statushistorie |
| **answers** | order_id, question_id, value (JSON) | Antworten. Werden schon während des Ausfüllens gespeichert, damit der Fortschritt erhalten bleibt. |
| **order_items** | order_id, product, quantity | Bestellpositionen (Song, Foto-Video-Aufpreis …) |
| **price_snapshots** | order_id, items (JSON), net, tax, gross, currency | **Unveränderlicher** Preis zum Zeitpunkt der Bestellung |
| **payments** | order_id, provider, provider_payment_id, status, amount, mode (test/live) | Zahlungen |
| *payment_events* | provider_payment_id, received_at, status_fetched, processed | Webhook-Protokoll, sorgt für Idempotenz |
| **refunds** | payment_id, amount, status, reason, actor | Rückerstattungen |
| **consents** | order_id/user_id, type, text_version, granted_at, revoked_at, ip_hash | Einwilligungen (Vorzeitiger Leistungsbeginn/Widerruf, Werbung, Veröffentlichung) |

### 10.4 Generierung
| Tabelle | Wichtige Spalten | Zweck |
|---|---|---|
| **prompt_versions** | key, version, template, model, active, created_by | Versionierte Prompts mit Rollback |
| **lyrics_versions** | order_id, version, title, content (JSON-Abschnitte), source (ai/customer), prompt_version_id, approved_at | Songtexte und alle Korrekturen |
| **music_jobs** | order_id, provider, provider_job_id, idempotency_key, status, attempt, cost_estimate, error | Musikaufträge |
| **music_candidates** | job_id, storage_key, duration_s, format, qc_result (JSON), qc_status, sections (JSON, falls vom Anbieter geliefert) | Erzeugte Kandidaten mit Ergebnis der Qualitätsprüfung |
| *preview_clips* | candidate_id, storage_key, start_s, duration_s, start_method (anbieter/songtext/analyse/ersatzwert) | Die 20-Sekunden-Hörprobe mit Wasserzeichen (E12) |
| *preview_usage* | user_id, order_id, cost_estimate_cents, created_at | Protokoll jeder erzeugten Hörprobe: Grundlage für das Limit pro Konto und das Tagesbudget (Werte in `app_settings`). Bleibt erhalten, auch wenn abgelaufene Hörproben gelöscht werden. |
| *share_pages* | order_id, token, active, created_at, disabled_at | Teilbare Song-Seite mit QR-Code (E17) |
| **selected_tracks** | order_id, candidate_id, selected_by (auto/admin/kunde) | Der ausgelieferte Song |
| **video_jobs** | order_id, template_id, format, status, attempt, error | Videoaufträge |
| *video_templates* | name, config (JSON), active | Videovorlagen |
| **videos** | order_id, storage_key, width, height, duration_s | Fertige Videos |
| **uploaded_assets** | order_id, storage_key, mime, size, sha256, scan_status | Kundenfotos (Phase C) |

### 10.5 Veröffentlichung, Betrieb, Verwaltung
| Tabelle | Zweck |
|---|---|
| publication_approvals, dropbox_exports | Freigabe und Export (Phase C) |
| *publication_targets* | Anlass → Dropbox-Ordner. Ein Eintrag ohne Anlass ist der Standardordner (E14). |
| **provider_configs** | Nicht geheime Einstellungen je Anbieter (aktiv, Limits, Retry-Regeln). **Keine Schlüssel.** |
| **app_settings** | Einstellungen, die im Admin geändert werden können: Anzahl der Korrekturen, Regenerationen und Kandidaten, Linklaufzeit … |
| **email_events** | Versand- und Zustellprotokoll |
| **audit_logs** | Wer hat wann was geändert (alter und neuer Wert) |
| *support_cases*, *data_requests* | Supportfälle, Lösch- und Exportanfragen |

Das vollständige Schema entsteht im Entwicklungsplan in Modul M2 als Drizzle-Schema mit Migrationen. Die Tabellen der ersten Version werden zuerst angelegt, die übrigen in späteren Phasen.

---

## 11. Projektstruktur (geplant)

```
songgen/
├─ docs/                    ← diese Dokumente
├─ src/
│  ├─ app/                  ← Next.js-Seiten und API-Routen
│  │  ├─ (shop)/            ← Landing, Fragebogen, Checkout, Songtext, Downloads
│  │  ├─ admin/             ← Admin-Bereich
│  │  ├─ api/webhooks/mollie/
│  │  └─ dev/mailbox/       ← nur im Testbetrieb erreichbar
│  ├─ domain/               ← Geschäftslogik ohne Framework (Statusmaschine, Preise, Limits)
│  ├─ providers/            ← Adapter: payment/, lyrics/, music/, email/, storage/
│  ├─ db/                   ← Drizzle-Schema, Migrationen, Seed-Daten
│  ├─ jobs/                 ← Job-Definitionen (Songtext, Musik, QC, Video, E-Mail)
│  └─ config/               ← Prüfung der Umgebungsvariablen, Testbetrieb-Regeln
├─ worker/                  ← Startpunkt des Worker-Prozesses
├─ tests/                   ← unit/, integration/, e2e/
├─ .env.example             ← Liste aller Variablen, ohne Werte
└─ package.json
```

---

## 12. Dropbox-Export für EasyGMV (Phase C)

EasyGMV holt die Videos selbstständig aus einem Dropbox-Ordner. Die Plattform muss also nur **das fertige Video in den richtigen Ordner legen**. Ablauf im Admin:

1. **„Mit Dropbox verbinden“**: Der Admin meldet sich bei Dropbox an und erlaubt den Zugriff (OAuth mit `token_access_type=offline`, damit die Verbindung dauerhaft bleibt). Das Token wird verschlüsselt gespeichert (Abschnitt 5).
2. **Ordner auswählen** (E14): Der Admin sieht die Ordnerstruktur der Dropbox und wählt entweder **einen Ordner für alles** oder **pro Anlass einen eigenen Ordner** (z. B. Trauer → `/Apps/SongPlattform/Trauer`, Liebe → `/Apps/SongPlattform/Liebe`). Anlässe ohne eigenen Ordner landen im Standardordner. Jeder Ordner kann in EasyGMV einem eigenen TikTok-Kanal zugeordnet werden. Gespeichert in `publication_targets`, jederzeit änderbar.
3. **Export**: Nach Einwilligung des Kunden und Freigabe durch den Admin lädt der Worker das MP4 hoch. Dateien bis 150 MiB gehen in einem Schritt, größere über eine „Upload-Session“ in Teilen. Ein 3-Minuten-Video liegt voraussichtlich deutlich darunter. Jeder Export wird in `dropbox_exports` protokolliert (Status, Fehler, Dateipfad) und nie doppelt hochgeladen.
4. **TikTok-Fassung:** Für die Veröffentlichung wird eine eigene Videofassung **ohne Kundenfotos** gerendert, es sei denn, der Besteller hat bestätigt, dass alle abgebildeten Personen einverstanden sind (E7).
5. **Trauer: Vorlage „Abschiedsvideo“** (E15, Modul C11): ein Foto in Schwarz-Weiß, Name, „geboren am … / verstorben am …“, ein Spruch und ein Aufruf wie „Teile dieses Video, um X auf eine letzte Reise um die Welt zu schicken“. Veröffentlichung nur, wenn der Besteller sie ausdrücklich beauftragt und bestätigt, dazu berechtigt zu sein. **Jedes Trauervideo gibt der Admin von Hand frei.** ⚠️ Rechtliche Prüfung (§ 22 KUG, Angehörige) und Prüfung der TikTok-Richtlinien zum Aufruf zum Teilen stehen noch aus (F-21, L17).

**Berechtigungen (geprüft in der Dropbox-Doku):** Dateien hochladen braucht `files.content.write`, Ordner auflisten `files.metadata.read`. Es gibt zwei Zugriffsarten:
- **App-Ordner**: Die App sieht nur `/Apps/<App-Name>/`. Das ist am sichersten, EasyGMV müsste dann aber auf diesen Ordner zugreifen.
- **Volle Dropbox**: Die App kann jeden vorhandenen Ordner wählen, sieht aber auch alles andere.

→ Frage F-15, welche Variante zu EasyGMV passt.
