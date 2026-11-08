# Pflichtenheft – Personalisierte KI-Songs und Musikvideos
Version 1.0 · 08.11.2026 · Arbeitsgrundlage für Claude Code

## 1. Ziel
Entwickle eine produktionsfähige, mobiloptimierte Webplattform (PWA), auf der Kunden personalisierte Songs für besondere Anlässe bestellen. Der Kunde wählt einen Anlass, beantwortet dynamische Fragen, bestimmt Genre/Stimmung/Stimme, bezahlt über Mollie und erhält anschließend einen KI-generierten Song sowie **immer** ein automatisches Musikvideo. Eigene Bilder sind optional. Veröffentlichung auf TikTok erfolgt ausschließlich nach gesonderter ausdrücklicher Einwilligung und Prüfung über Dropbox → EasyGMV.

## 2. Verbindliche Produktentscheidungen
- Startsprache Deutsch; Englisch technisch vorbereiten und später im Admin aktivierbar.
- Gastbestellung ohne Konto; optionales Kundenkonto mit Bestellhistorie.
- Zahlung **vor** Generierung und Anzeige des Songtexts.
- Nach Zahlung Songtext erstellen, zur Korrektur anzeigen, Freigabe einholen, Musik generieren.
- Ein guter Song wird ausgeliefert; intern können mehrere Kandidaten entstehen.
- Anzahl kostenloser Korrekturen, Regenerationen, Kandidaten und Limits im Admin einstellbar.
- Musikgenre frei wählbar (z.B. Schlager, Pop, Deutschrock, Ballade, Rap, Rock); KI darf Vorschläge machen.
- Zu **jedem** Song ein MP4-Musikvideo, standardmäßig 9:16. Ohne Fotos: animierter Hintergrund und Titel/optional Lyrics. Mit Fotos: automatisch synchronisierte Slideshow. Weitere Formate optional.
- Dropbox-Upload nur für ausdrücklich freigegebene, zur Veröffentlichung geprüfte Videos; Ordner je Anlass/Kanal konfigurierbar. EasyGMV holt Videos aus diesen Ordnern; tatsächliches Metadaten-/Importformat separat mit EasyGMV abstimmen.
- Mollie als Zahlungsanbieter; Preise, Zusatzoptionen, Steuern und Gutscheine administrierbar.
- Preisidee (nicht festgeschrieben): 9,99 € Song, Video mit Fotos optionaler Aufpreis. Standardvideo immer enthalten.
- Privatheit ist Standard. Öffentliche Nutzung nur mit separater, nachweisbarer Einwilligung, ohne vorangekreuzte Checkbox. Optionaler Werberabatt nur nach rechtlicher Prüfung.

## 3. Benutzerablauf
1. Landingpage: Beispiele, Anlasskategorien (Liebe, Hochzeit, Geburtstag, Trauer, Familie, Freundschaft, Humor), Preise und FAQ.
2. Anlass wählen; dynamischer Fragebogen mit bedingten Folgefragen, Speicherung des Fortschritts. Texteingabe und Smartphone-Diktat; echter Sprachdialog als spätere optionale Erweiterung.
3. Musikgenre, Stimmung, Sprache und Stimme wählen; optional Fotos hochladen und Videooptionen wählen.
4. Checkout als Gast (E-Mail) oder angemeldet. Transparente Gesamtpreise, Nutzungsrechte und Datenschutzinformationen.
5. Mollie-Checkout; Bestellung ausschließlich nach **serverseitig verifizierter** Zahlung freigeben (Webhook idempotent, Statusabgleich per Mollie-API).
6. KI generiert Songtext aus Antworten. Kunde prüft, korrigiert und bestätigt; Limits konfigurierbar.
7. Musikdienst generiert Songkandidaten asynchron; automatische technische Qualitätsprüfung (Datei, Dauer, Stille, Sprache/Text soweit zuverlässig möglich); unsichere Fälle zur manuellen Prüfung. Keine Garantie, dass KI die „beste“ Version erkennt.
8. Kunde kann vollständigen Song anhören und je nach konfigurierten Regeln regenerieren; Download MP3/WAV abhängig vom Anbieter.
9. Video-Renderer erstellt MP4 zu jedem Song. Mit Fotos: Slideshow; ohne Fotos: Templateanimation. Generierung im Hintergrund mit Fortschrittsanzeige.
10. Kunde erhält E-Mail mit zeitlich begrenztem, signiertem Zugriffslink. Downloads und Status auch im Konto.
11. Nur nach aktiver Einwilligung und optionaler Adminfreigabe: Video in den konfigurierten Dropbox-Zielordner übertragen; Werbetext/Hashtags als Begleitmetadaten exportieren; Übertragungsstatus und Fehler protokollieren.

## 4. Adminbereich (rollenbasiert)
- Dashboard: Bestellungen, Umsatz, Refunds, Generierungskosten, Fehlerraten, Warteschlangen, Publikationsstatus.
- Produkt-/Preisverwaltung: Anlässe, Grundpreise, Video-Extras, Zusatzversionen, Coupons, Steuersätze, Währungen; Preis-Snapshot pro Bestellung.
- Fragebogen-Builder: Fragen, Reihenfolge, Pflichtfelder, bedingte Logik, Sprachen, Prompts.
- Genres/Stimmungen/Stimmen und KI-Empfehlungsregeln.
- Textvorlagen und KI-Prompts versioniert, testbar und mit Rollback.
- Anbieter-Verwaltung: Musik-Provider, LLM, API-Konfiguration, Limits, Retry-Regeln, Kostenlimits, Failover. Secrets verschlüsselt und nie im Browser.
- Video-Vorlagen, Upload-Limits, Format, Auflösung, Renderqualität, Wasserzeichen.
- Mollie-Konfiguration, Zahlungsübersicht, Rückerstattungsworkflow, Rechnungs-/Belegintegration.
- Dropbox-Verbindung, Zielordner nach Kategorie/Kanal, Publikationsfreigaben, Export-Logs.
- Kunden, Gastbestellungen, Bestellstatus, Supportfälle, Lösch-/Exportanfragen.
- Sprachen, E-Mail-Vorlagen, Branding, SEO, Impressum/Datenschutztexte (juristisch prüfen).
- Rollen: Owner, Admin, Support, Content-Reviewer; Audit-Log für sensible Änderungen.

## 5. Architekturvorschlag
- Frontend/Backend: Next.js + TypeScript, responsiv, PWA.
- Datenbank: PostgreSQL (z.B. Supabase); Auth mit Supabase Auth oder gleichwertig.
- Dateispeicher: private Object Storage Buckets, signierte URLs, Lifecycle-Regeln.
- Hintergrundjobs: persistente Queue + Worker (Musik, Video, Dropbox, E-Mail); keine langlaufenden Aufgaben im Webrequest.
- Musik-Provider als austauschbares Adapter-Interface: `generate`, `getStatus`, `getAssets`, `estimateCost`, `cancel` soweit unterstützt. Anbieter nicht hart codieren.
- **Vor Implementierung prüfen:** offizielle API, kommerzielle Nutzung, Weiterverkauf an Endkunden, Nutzungsrechte, Datenschutz, Preis und Verfügbarkeit. Suno-API nicht voraussetzen; ElevenLabs Music als zu prüfender Kandidat, kein verbindlich ausgewählter Provider.
- Textgenerierung: austauschbares LLM-Interface, Prompt-Versionierung.
- Video: FFmpeg-Worker; MP4 H.264/AAC, 1080x1920 konfigurierbar; lizenzierte Assets.
- Zahlung: Mollie Orders/Payments nach aktueller offizieller Dokumentation; Webhook + serverseitiger Statusabruf; keine doppelte Verarbeitung.
- Dropbox: OAuth mit minimalen Berechtigungen, Token sicher speichern; Retry und deduplizierter Export.
- E-Mail: transaktionaler Dienst mit Zustellprotokoll.
- Observability: strukturierte Logs, Fehlertracking, Kosten- und Jobmonitoring.

## 6. Datenmodell (Mindestumfang)
users, guest_access_tokens, roles, occasions, questionnaire_versions, questions, question_options, answers, genres, voices, orders, order_items, price_snapshots, payments, refunds, lyrics_versions, music_jobs, music_candidates, selected_tracks, video_jobs, uploaded_assets, videos, consents, publication_approvals, dropbox_exports, provider_configs, prompt_versions, email_events, audit_logs, app_settings.

Jede Bestellung besitzt eine eindeutige ID, nachvollziehbare Statushistorie und unveränderlichen Preis-Snapshot. Gastzugriffe nur mit kurzlebigen, sicheren Links. Einwilligungen mit Version, Zeitpunkt, Umfang und Widerrufsstatus dokumentieren.

## 7. Sicherheit, Datenschutz, Rechte
- DSGVO-konforme Datenminimierung, Speicherfristen, Export/Löschung, AV-Verträge, Auftragsverarbeiterprüfung und gegebenenfalls Drittlandtransfer.
- Private Fotos und Trauerinhalte besonders vorsichtig behandeln; keine öffentliche Nutzung ohne aktive Einwilligung; Rechte Dritter an Fotos/Personen und Musik beachten.
- Separate Einwilligung für Werbung, mit Widerrufsprozess und Grenzen bereits erfolgter Veröffentlichung transparent erklären.
- Alters-/Missbrauchsschutz, Uploadvalidierung, Malwareprüfung, Größenlimits, Rate Limits, CSRF/XSS-Schutz, RBAC, RLS wo geeignet.
- Vor Livegang deutsche Verbraucherpflichten prüfen: Preisangaben, digitale Inhalte, Widerrufsrecht und ausdrückliche Zustimmung bei vorzeitigem Leistungsbeginn, Rechnungen und steuerliche Behandlung.
- API-Lizenzbedingungen schriftlich verifizieren; nicht auf inoffizielle Browserautomatisierung als primäre Musik-Integration setzen.

## 8. Qualitäts- und Abnahmekriterien
- Gast kann eine Bestellung ohne Registrierung abschließen.
- Kein Songtext wird vor bestätigter Zahlung angezeigt oder generiert.
- Mollie-Webhook ist gegen Wiederholungen und gefälschte Benachrichtigungen abgesichert.
- Admin kann Preise, Genres, Fragen, Freiversuche und Dropbox-Zielordner ohne Codeänderung bearbeiten.
- Jeder erfolgreiche Songauftrag erzeugt ein abspielbares Video auch ohne Fotos.
- Fotos bleiben privat und werden nur in die jeweils bestellte Videoproduktion übernommen.
- Kein Dropbox-Export ohne dokumentierte Werbeeinwilligung und erforderliche Freigabe.
- Fehlerhafte Providerjobs sind wiederholbar, ohne Doppelzahlung oder Doppelveröffentlichung.
- Tests: Unit, Integration, End-to-End (Mollie-Testmodus, Provider-Mocks), Sicherheit, mobile Bedienung und Barrierefreiheit.

## 9. Umsetzung in Phasen
**Phase A – Architektur und Entscheidungen:** Repositoriestruktur, Architekturdiagramm, Datenbankschema, Statusmaschinen, Provider- und Lizenzprüfung, Kostenmodell, Sicherheitskonzept. Noch keine unkontrollierte Komplettimplementierung.

**Phase B – MVP:** Deutsche Landingpage, Fragebogen, Genres, Gastcheckout, Mollie-Testzahlung, Songtext nach Zahlung, manuelle Textfreigabe, Musik-Provideradapter mit Mock und einem verifizierten echten Provider, einfaches Standardvideo, sichere Downloads, Basis-Admin.

**Phase C – Ausbau:** Foto-Slideshow, Kundenkonto, Coupons, detaillierter Admin, E-Mail, Dropbox-Export mit Consent-Workflow, EasyGMV-Metadaten, Monitoring und Retry.

**Phase D – Skalierung:** Englisch aktivieren, Sprachdialog, zusätzliche Provider, weitere Videoformate, A/B-Tests, Performance- und Kostenoptimierung.

## 10. Konkreter Startauftrag an Claude Code
Du bist leitender Full-Stack-Architekt und Senior-Entwickler. Lies dieses gesamte Pflichtenheft. Erstelle zunächst:
1. eine priorisierte Liste offener Entscheidungen und externer Abhängigkeiten,
2. eine technische Architektur mit Sicherheits-/Datenschutzgrenzen,
3. ein PostgreSQL-Datenbankschema samt Migrationen,
4. ein Rollen- und Berechtigungskonzept,
5. eine asynchrone Job-/Statusarchitektur,
6. Provider-Interfaces für Musik, LLM, Video, Mollie und Dropbox,
7. einen phasenweisen Implementierungsplan mit Tests und Akzeptanzkriterien.
Markiere externe API-/Lizenzannahmen ausdrücklich als unbestätigt, bis sie anhand offizieller Dokumentation geprüft wurden. Frage vor kostenpflichtigen API-Aufrufen und vor Produktivbereitstellung nach Freigabe. Beginne nach Bestätigung mit Phase B. Schreibe sauberen, getesteten, wartbaren TypeScript-Code; verwende Umgebungsvariablen/Secret-Management und niemals hartcodierte Zugangsdaten.
