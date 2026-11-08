# Offene Fragen, Widersprüche und Lücken

Stand: 08.11.2026 (3. Fassung, nach der zweiten Antwortrunde des Auftraggebers)

Teil A ist das **Entscheidungsprotokoll**. Teil B listet Widersprüche und Lücken im Pflichtenheft. Teil C enthält die noch offenen Fragen.

---

## Teil A – Getroffene Entscheidungen (08.11.2026)

### Erste Runde
| # | Entscheidung | Folge |
|---|---|---|
| E1 | Das Projekt wird vollständig nach `C:\dev\songgen` verlegt, also außerhalb von Qsync. | Die Sicherung erfolgt über Git und ein privates GitHub-Repository. |
| E2 | ~~Entwicklungsdatenbank bei Supabase.~~ → **ersetzt durch E10.** Domain und E-Mail kommen von Strato. | – |
| E3 | Auftraggeber ist eine **UG mit wenigen Mitarbeitenden**. | Bei ElevenLabs kommt der Tarif Scale (unter 10 Mitarbeitende) in Frage. |
| E4 | Song etwa **3 Minuten**, **2 Kandidaten**, in der ersten Version **nur deutsche Songs**. | Vor der Zahlung wird nur 1 Kandidat erzeugt (Vorschlag, siehe E12). |
| E5 | **Keine Gastbestellung**, Bestellen nur mit Kundenkonto. | Das Abnahmekriterium „Gast kann ohne Registrierung bestellen“ **entfällt**. Der Fragebogen bleibt ohne Anmeldung ausfüllbar. Der Zeitpunkt der Anmeldung ist in E11 neu festgelegt. |
| E6 | **Dropbox:** Im Admin wird die Dropbox-Verbindung hergestellt und ein Zielordner gewählt. Dorthin kommt das fertige Video, den Rest erledigt EasyGMV. | Kein Metadaten- oder Importformat nötig. Erweitert durch E14. |
| E7 | **Fotos in TikTok-Videos** nur, wenn der Besteller bestätigt, dass alle abgebildeten Personen einverstanden sind. Sonst wird eine Fassung **ohne Fotos** veröffentlicht. | Es gibt eine zweite Video-Fassung für die Veröffentlichung. Ausnahme Trauervideo, siehe E15. |
| E8 | Feste API-Schlüssel nur in Umgebungsvariablen. Dropbox wird im Admin per Klick verbunden, das Token wird verschlüsselt gespeichert. | Löst den Widerspruch W2. |
| E9 | Alternativen zur schriftlichen Anfrage prüfen: **eigene KI (ACE-Step)** und Anbieter mit klaren AGB. | Siehe `ANBIETERPRUEFUNG.md`, Abschnitt 4a. |

### Zweite Runde
| # | Entscheidung | Folge |
|---|---|---|
| E10 | **Alles läuft in der Hetzner Cloud**: App, Worker, Datenbank, Dateien. Nur Domain und E-Mail bleiben bei Strato. | Supabase entfällt ganz. Datenbank: PostgreSQL auf Hetzner. Dateien: Hetzner Object Storage. Login: eine Bibliothek in der App (Vorschlag: Better Auth). Entwicklung auf einem eigenen kleinen Hetzner-Testserver. Siehe `ARCHITEKTUR.md`, Abschnitt 2. |
| E11 | **Anmeldung vor dem Songtext.** Den Fragebogen kann man ohne Konto ausfüllen. Bevor Songtext und Hörprobe entstehen, muss man sich anmelden (E-Mail bestätigt). | Ersetzt „Anmeldung beim Checkout“ aus E5. Missbrauchsschutz: begrenzte Zahl Hörproben pro Konto. |
| E12 | **Hörprobe vor der Zahlung** (Variante C): Songtext und Musik entstehen vor der Zahlung. Der Kunde hört **20 Sekunden** mit Wasserzeichen, und zwar aus der Mitte des Songs, wo Gesang zu hören ist. Erst nach der Zahlung bekommt er den ganzen Song und das Video. | Das Abnahmekriterium „kein Songtext vor bestätigter Zahlung“ aus Pflichtenheft Abschnitt 8 **entfällt**. Neues Kriterium: **Die vollständige Audiodatei und das Video verlassen den Server erst nach bestätigter Zahlung.** Im Admin: Länge der Hörprobe, Hörproben pro Konto, Tagesbudget, Kostenbremse. |
| E13 | **Preis ist im Admin einstellbar**, voraussichtlich höher als 9,99 €. | Kein fester Preis im Code. Der Preis wird pro Bestellung als unveränderlicher Snapshot gespeichert. |
| E14 | **Dropbox-Ordner pro Thema:** Im Admin wählbar, ob alles in einen Ordner geht oder jeder Anlass (Trauer, Liebe …) einen eigenen Ordner bekommt. Jeder Ordner kann einem eigenen TikTok-Kanal in EasyGMV entsprechen. | Neue Tabelle `publication_targets` (Anlass → Dropbox-Ordner, mit Standardordner). |
| E15 | **Trauer wird veröffentlicht**, wenn der Kunde es ausdrücklich beauftragt und einwilligt. Eigene Vorlage „Abschiedsvideo“: ein Foto in Schwarz-Weiß, Name, geboren/verstorben, Spruch und ein Aufruf wie „Teile dieses Video, um X auf eine letzte Reise um die Welt zu schicken“. | Die rechtliche Prüfung folgt später (Einwilligung der Angehörigen, § 22 KUG). Jede Veröffentlichung eines Trauervideos gibt der Admin von Hand frei. Ersetzt den Vorschlag aus F-9. |
| E16 | **Widerruf:** Vor der Zahlung setzt der Kunde einen eigenen Haken. Damit verlangt er den sofortigen Beginn der Leistung und bestätigt, dass er sein Widerrufsrecht dabei verliert. Der Haken ist nicht vorangekreuzt. | War in M4 schon vorgesehen und wird jetzt verbindlich. Dazu gehört eine Bestätigungs-E-Mail mit Vertragsinhalt und Hinweis auf den Verzicht (dauerhafter Datenträger). ⚠️ Den Wortlaut prüft ein Anwalt. Eine Rückerstattung bei Mängeln (Gewährleistung) bleibt trotzdem möglich. |
| E17 | **Von der Beispielseite yourmelody.org übernehmen, was funktioniert.** Das Alleinstellungsmerkmal ist die Veröffentlichung über EasyGMV. | Übernommen: Hörprobe, teilbare Song-Seite mit QR-Code, eigener Songtext möglich, Änderungen nach der Lieferung (Zahl einstellbar). Nicht übernommen: Express-Lieferung (unser Song ist in Minuten fertig). Später (Phase D): Plakette mit QR-Code als Druckprodukt. |

### Dritte Runde
| # | Entscheidung | Folge |
|---|---|---|
| E18 | **Markenname und Domain: melomio** (`melomio.de`). F-18 bestätigt, Entwicklungsplan freigegeben (F-4). Logo geliefert (Herz mit Note, Verlauf Koralle #FD6F6D → Violett #7821CD, Schrift #040A2E), eingebaut am 08.11.2026. Domain ist registriert, wird aber erst beim Livegang (C10) auf Hetzner gelenkt; E-Mail-Passwörter trägt der Auftraggeber selbst in die Umgebungsvariablen ein (nie im Chat). | Git-Repository: `github.com/eurozahler/melomio` (privat). Hetzner-Projekt: `melomio.de`. Der E-Mail-Absender wird voraussichtlich eine Adresse `@melomio.de` (F-13). |

### Erklärung zu E8: Zugangsdaten im Admin oder in Umgebungsvariablen?
Das Pflichtenheft wollte im Admin ein Formular für API-Schlüssel (z. B. den Mollie-Schlüssel). Die Schlüssel lägen dann verschlüsselt in der Datenbank. Deine Vorgabe war: Zugangsdaten nur in Umgebungsvariablen.

- **Umgebungsvariablen** sind Einstellungen, die direkt auf dem Server hinterlegt werden, außerhalb der Webseite. Die Webseite kann sie lesen, aber niemand kann sie über die Webseite ansehen oder ändern.
- **Vorteil:** Wird ein Admin-Passwort gestohlen oder die Datenbank kopiert, sind die Schlüssel trotzdem sicher.
- **Nachteil:** Wer einen Schlüssel ändern will, muss das auf dem Server tun, nicht im Admin. Danach startet die App neu.

**Lösung:** Feste Schlüssel stehen in Umgebungsvariablen. Der Admin zeigt nur „verbunden ✔ / Testmodus / Livemodus“. Das Dropbox-Token entsteht erst beim Klick auf „Mit Dropbox verbinden“ und wird verschlüsselt in der Datenbank gespeichert. Der Schlüssel dazu liegt in einer Umgebungsvariable.

---

## Teil B – Prüfung des Pflichtenhefts

### B1. Widersprüche
| # | Problem | Stand |
|---|---|---|
| W1 | Mollie empfiehlt die Orders API nicht mehr. | Nur die **Payments API** verwenden. |
| W2 | Zugangsdaten im Admin ↔ Umgebungsvariablen | ✅ gelöst durch E8 |
| W3 | Phase B verlangt einen echten Musikanbieter, aber Zugang und Lizenzbestätigung fehlen. | Die erste Version läuft mit dem Mock-Anbieter, der echte Adapter kommt nach Klärung. |
| W4 | Downloads in Phase B, E-Mail erst in Phase C | ✅ gelöst durch E5 |
| W5 | Einwilligung des Kunden ↔ Rechte der abgebildeten Personen | ✅ gelöst durch E7 |
| W6 | WAV-Download hängt vom Anbieter ab. | MP3 als Standard. |
| W7 | „Stimme wählen“: Musik-KIs kennen keine festen Stimmen. | Stimmen sind Beschreibungen wie „warme Männerstimme“, keine Garantie. |
| W8 | Songtext im Video braucht Zeitstempel. | Erste Version nur mit Titel, synchroner Text in Phase C. |
| W9 | Pflichtenheft: „Zahlung vor Generierung und Anzeige des Songtexts“ ↔ Hörprobe vor der Zahlung | ✅ entschieden durch E12: Hörprobe vor der Zahlung |
| W10 | Pflichtenheft: Supabase als Beispiel ↔ alles bei Hetzner | ✅ entschieden durch E10 |

### B2. Lücken
- L1: Fehlende Tabellen sind in `ARCHITEKTUR.md` ergänzt.
- L2: Musikanbieter offen, siehe F-2.
- ~~L4: Hosting offen~~ → ✅ Hetzner Cloud (E10).
- L5: Steuern und Rechnungen offen, siehe F-11.
- L6–L8: Mindestalter, Speicherfristen, Rückerstattung offen, siehe F-14.
- L11: Korrekturen am Songtext und Neuversuche bei der Musik, siehe Vorschlag F-18.
- ~~L12: Trauer und Veröffentlichung~~ → ✅ E15, rechtliche Prüfung offen.
- L14: Rechtstexte liefert der Auftraggeber.
- L15: KI-Kennzeichnung ist nötig (TikTok und ElevenLabs verlangen sie).
- L16 (neu): **Kosten der Hörproben.** Jede Hörprobe kostet bei einem Anbieter wie ElevenLabs echtes Geld, auch wenn der Kunde nicht kauft. Deshalb gibt es Tagesbudget, Limit pro Konto und eine Kostenbremse im Admin. Hörproben, aus denen nach X Tagen kein Kauf wird, werden gelöscht.
- L17 (neu): **Aufruf zum Teilen im Trauervideo.** Prüfen, ob „Teile dieses Video …“ gegen die TikTok-Richtlinien verstößt (Stichwort „Engagement-Bait“). ⚠️ Nicht geprüft.

---

## Teil C – Noch offene Fragen

### Vor dem Start nötig
- ~~F-4 Freigabe der ersten Version~~ → ✅ **freigegeben am 08.11.2026** (M0–M11, 2. Fassung).
- ~~F-18 Songtext-Korrekturen~~ → ✅ **Vorschlag bestätigt am 08.11.2026:**
  - Der Songtext ist vor der Zahlung **vollständig sichtbar**. Der Kunde muss ihn freigeben, bevor Musik entsteht, sonst wird Geld für einen Song mit falschem Text ausgegeben. Das Risiko, dass jemand den Text kopiert und woanders vertont, ist klein. Die Musik ist der eigentliche Wert.
  - **Selbst bearbeiten** (z. B. einen Namen oder ein Wort ändern) ist **unbegrenzt** möglich. Dabei arbeitet keine KI, also wird der Text dadurch nicht schlechter.
  - **„KI neu formulieren lassen“**: standardmäßig **1-mal** kostenlos. Im Admin einstellbar von 0 bis beliebig viele. Das deckt sich mit deiner Erfahrung, dass viele KI-Durchgänge das Ergebnis verschlechtern.
  - **Neuversuche bei der Musik:** vor der Zahlung 0, nach der Zahlung 1 (einstellbar).
  - Später lässt sich mit kleinen Umfragen oder A/B-Tests herausfinden, was am besten ankommt (Phase D).
- ~~F-17 Grafikkarte~~ → ✅ geprüft: Quadro M1000M mit 2 GB. Das ist zu wenig und zu alt für ACE-Step. Ein Test bräuchte einen gemieteten GPU-Rechner.

### Vor dem echten Songtext mit Claude
- **F-22 Freigabe für echte Songtexte mit Claude:** Der Claude-Baustein ist fertig und getestet, aber **ohne einen einzigen echten Aufruf** (Tests laufen gegen eine Attrappe). Für den ersten echten Aufruf braucht es: einen API-Schlüssel von Anthropic (trägt der Auftraggeber selbst in `.env.local` ein, Variable `ANTHROPIC_API_KEY`), `LYRICS_PROVIDER=anthropic` und die ausdrückliche Freigabe. Modell: Claude Opus 5.5 (`claude-opus-5-5`, ca. 4 $ / 20 $ je 1 Mio. Ein-/Ausgabe-Tokens ⚠️ Stand der Referenz vom 06.10.2026), mittlere Denktiefe, mit automatischem Rückfall auf ein anderes Modell, falls Claude eine Anfrage aus Sicherheitsgründen ablehnt. Grobe Schätzung pro Songtext: wenige Cent (⚠️ vor dem Livegang mit echten Aufrufen messen). Das Modell lässt sich pro Prompt-Version ändern (Tabelle `prompt_versions`).

### Vor dem echten Bezahlen mit Mollie
- **F-23 Mollie-Konto:** Für den Mollie-Testmodus braucht es ein (kostenloses) Mollie-Konto und einen Testschlüssel `test_…` – trägt der Auftraggeber selbst in `.env.local` ein (`PAYMENT_PROVIDER=mollie`, `MOLLIE_API_KEY=…`). Bis dahin läuft der Test-Bezahlanbieter. Hinweis: Mollie kann den PC (localhost) nicht erreichen; der Webhook funktioniert erst auf dem Testserver. Lokal fragt die App den Status bei der Rückkehr von der Bezahlseite selbst ab.
- **F-24 Rechtstexte beim Kauf:** Der Wortlaut der beiden Pflicht-Haken und der Bestellbestätigung (`src/domain/consents.ts`, `src/server/email/templates.ts`) ist ein Entwurf (Fassung „2026-11-08-entwurf“) und muss juristisch geprüft werden. AGB, Datenschutz und Impressum sind Platzhalter (L14).

### Vor dem echten Musikanbieter
- **F-2 Musikanbieter:** Hörtest ElevenLabs gegen ACE-Step mit 3–5 deutschen Beispieltexten, danach Entscheidung. ACE-Step nur auf einem gemieteten GPU-Rechner (Hetzner Cloud bietet nach meinem Stand keine GPUs pro Stunde an, ⚠️ nicht geprüft). Zu ElevenLabs: Die kleinen Tarife sind laut AGB „For Individual Use Only“. Ob ein interner Test damit erlaubt ist, ist ungeklärt.
- ~~F-12 Strato-Paket~~ → ✅ erledigt durch E10.
- **F-19 Hörprobe aus der Mitte (technisch):** Damit die 20 Sekunden dort beginnen, wo gesungen wird, gibt es drei Wege. Erstens: Der Anbieter liefert Abschnittszeiten (Strophe, Refrain), dann nehmen wir den ersten Refrain. Zweitens: Wir schätzen die Stelle aus dem Aufbau des Songtexts. Drittens: Wir erkennen den Gesang per Lautstärke- und Frequenzanalyse. Was davon geht, hängt vom Anbieter ab und wird beim echten Adapter geprüft. Im Admin gibt es einen Ersatzwert (z. B. „ab 35 % der Songlänge“).

### Später (Phase C)
- **F-15 Dropbox-Zugriffsart:** Kann EasyGMV Ordner wie `/Apps/SongPlattform/Trauer` und `/Apps/SongPlattform/Liebe` überwachen? Dann genügt die sichere Variante „App-Ordner“. Wenn es bereits vorhandene Ordner außerhalb davon sein müssen, braucht die App Zugriff auf die ganze Dropbox.
- ~~F-16 Login-Methode~~ → ✅ **beides** (E-Mail + Passwort und E-Mail-Link ohne Passwort), bestätigt am 08.11.2026.
- **F-11 Steuern:** Kleinunternehmerregelung oder reguläre MwSt.? Gibt es ein Rechnungsprogramm?
- **F-13 E-Mail-Absender:** Welche Adresse bei Strato (z. B. `songs@deinedomain.de`)? Sie wird auch für Anmelde-E-Mails gebraucht.
- **F-14 Mindestalter, Speicherfristen, Rückerstattungsregeln:** Vorschläge kommen in Phase C.
- **F-20 Rabatt für Veröffentlichung:** Später entscheiden. ⚠️ Die Einwilligung muss freiwillig bleiben, deshalb rechtlich prüfen.
- **F-21 Rechtliche Prüfung Trauer:** Einwilligung der Angehörigen, Bilder Verstorbener (§ 22 KUG), Wortlaut der Beauftragung.

## Teil D – Sammelliste nach M8–M11 (zum gemeinsamen Durchgehen)

Stand: 08.11.2026, nach Abschluss der ersten Version (M0–M11). Sortiert nach Dringlichkeit.

### Entscheidungen, die du treffen musst
1. **Testserver freischalten?** Alles ist vorbereitet (`infra/testserver/README.md`, Abschnitt „App“). Es fehlt:
   - deine Zusage zur Subdomain (Vorschlag `test.melomio.de`),
   - der DNS-Eintrag bei Strato (Typ A, `test` → `2.31.55.169`),
   - deine Freigabe, Port 80/443 zu öffnen.
   
   Die Seite ist dann nur mit Passwort erreichbar und wird nicht von Suchmaschinen erfasst.
2. **F-13 E-Mail-Absender:** Welche Adresse bei Strato (z. B. `hallo@melomio.de`)? Ohne sie gehen keine echten E-Mails raus. Auf dem Testserver hilft bis dahin das Test-Postfach `/dev/mailbox`.
3. **F-22 Claude für Songtexte:** Den Schlüssel hast du selbst eingetragen und testest. Offen sind:
   - Bist du mit der Qualität zufrieden?
   - Sollen echte Kosten pro Songtext gemessen werden (wenige Testaufrufe, kostenpflichtig)?
   - Soll der Testserver ebenfalls Claude nutzen? Standard dort ist der Test-Baustein ohne Kosten.
4. **F-2 Musikanbieter:** Das ist der größte offene Punkt. Ohne echten Anbieter ist die „Musik“ ein Testton. Vorschlag: Hörtest mit 3–5 deutschen Texten (kostenpflichtig, wenige Euro), danach Entscheidung und Adapter.
5. **F-23 Mollie-Konto:** Ein kostenloser Testschlüssel genügt für den Test. Der Webhook funktioniert erst auf dem Testserver.
6. **Zweiter Musik-Kandidat nach dem Kauf** (E4, Einstellung `music_extra_candidates_after_purchase`): ist noch ohne Wirkung. Gehört er zur ersten Version oder zu Phase C?

### Sicherheit
7. **DB-Passwort und Auth-Schlüssel erneuern?** Beide sind bisher nur auf deinem PC und dem Server gespeichert. Eine Erneuerung ist nicht zwingend, aber vor dem Livegang empfohlen. Bitte kurz bestätigen, dass nichts davon geteilt wurde.
8. **`npm audit`:** 12 mittelschwere Meldungen, **alle in Entwicklungswerkzeugen** (drizzle-kit über ein altes esbuild, ESLint über minimatch), keine im Programm, das Kunden erreicht. Die automatische Reparatur würde auf ältere, inkompatible Versionen zurückgehen. Vorschlag: auf Updates der Werkzeuge warten und vor dem Livegang erneut prüfen.

### Für den Livegang (Phase C, zur Kenntnis)
9. **F-24 Rechtstexte:** AGB, Datenschutz, Impressum, Widerrufs-Haken und Bestellbestätigung sind Entwürfe bzw. Platzhalter. Sie müssen juristisch geprüft werden.
10. **Logo als SVG:** Das gelieferte PNG funktioniert. Ein SVG wäre auf allen Bildschirmen scharf und kleiner.
11. **F-15 Dropbox / EasyGMV:** erst für C7 nötig.

### Bekannte kleine Lücken der ersten Version
- **Admin:** Das Bestelldetail zeigt Songtext, Verlauf und die vollständigen Musik-Kandidaten, aber noch nicht die geschnittene Hörprobe und das Video. Kommt mit C6.
- **Admin ist nur auf Deutsch.** Die Kundenseiten sind mehrsprachig vorbereitet.
- **Admin für Nicht-Admins:** Statt eines „echten“ 404-Status liefert Next.js wegen des Streamings Status 200 mit der Seite „Seite nicht gefunden“. Admin-Inhalte werden dabei nicht ausgeliefert. Kein Sicherheitsproblem.
- **Barrierefreiheit:** Die automatische Prüfung (axe, WCAG 2.1 AA) ist auf allen Kundenseiten ohne Befund. Eine Prüfung von Hand (Screenreader, Tastatur) steht noch aus.
