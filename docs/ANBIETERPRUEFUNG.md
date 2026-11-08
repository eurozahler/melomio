# Prüfung der API-Anbieter

Stand: 08.11.2026 · Grundlage: offizielle Dokumentation und Nutzungsbedingungen der Anbieter, am 08.11.2026 abgerufen (Quellen am Ende).

**Kennzeichnung:**
- ✅ **bestätigt**: so in der offiziellen Dokumentation gelesen
- ⚠️ **ungeklärt**: widersprüchlich, nicht auffindbar oder nur aus Sekundärquellen bekannt
- ⛔ **Ausschlussgrund**

> **Wichtig:** Dies ist eine technische Recherche und **keine Rechtsberatung**. Ob ein bestimmtes Geschäftsmodell lizenzrechtlich erlaubt ist, muss vor dem Livegang **schriftlich vom Anbieter bestätigt** werden, wie es Pflichtenheft Abschnitt 7 verlangt. Am besten prüft zusätzlich eine Fachanwältin oder ein Fachanwalt.

---

## 1. Musikgenerierung – Zusammenfassung

| Kriterium | ElevenLabs Music | Google Lyria 3 / 3.5 | Mureka | Suno | Stable Audio |
|---|---|---|---|---|---|
| Offizielle, öffentliche API | ✅ ja (nur für zahlende Kunden) | ✅ ja (Vertex AI, Gemini API) | ✅ ja | ⛔ **nein**, nur ein Partnerprogramm in Erkundung | ✅ ja |
| Gesang mit **eigenem Songtext** | ✅ ja (Kompositionsplan mit Textzeilen) | ✅ ja („user-provided lyrics“) | ✅ ja (`lyrics`-Feld) | – | ⛔ nein, nur instrumental |
| Deutsch | ✅ ausdrücklich genannt | ✅ auf Vertex ausdrücklich genannt · ⚠️ in der Gemini API nicht ausdrücklich | ✅ ausdrücklich genannt | – | – |
| Max. Länge | ⚠️ 5 min (Übersicht) vs. 10 min (API-Referenz) | ✅ 184 s (Lyria 3 Pro) · ⚠️ Lyria 3.5: „ein paar Minuten“ | ⚠️ nicht gefunden | – | 380 s |
| Formate | ✅ MP3, PCM (unkomprimiert) · ⚠️ WAV direkt nicht im API-Parameter | ✅ MP3 · Lyria 3.5 in der Gemini API auch WAV | ⚠️ nicht gefunden | – | MP3, WAV |
| Ablauf | synchron: Audio kommt direkt in der Antwort | synchron | asynchron: Auftrags-ID, dann Abfrage | – | asynchron |
| Kommerzielle Nutzung | ✅ je nach Tarif (Tabelle unten) | ⚠️ Preview erlaubt Produktivnutzung, aber **ohne SLA und ohne Freistellung** | ⚠️ laut FAQ ja; die AGB selbst nicht lesbar | – | ✅ |
| Preis | ab 299 $/Monat (Unternehmens-Tarif, s. u.) | ⚠️ ca. 0,08 $/Song (Gemini API, nur aus einer Zusammenfassung der Preisseite) | ⚠️ nicht gefunden | – | ~0,08 $ |
| Wasserzeichen | optional C2PA (bei MP3) | SynthID (unhörbar) immer, C2PA | ⚠️ unbekannt | – | – |
| **Bewertung** | **Kandidat 1** | **Kandidat 2 / Ausweichanbieter** | **Kandidat 3** | ⛔ ausgeschlossen | ⛔ ausgeschlossen |

---

## 2. ElevenLabs Music – Details

**Funktion ✅**
- Endpunkt `POST /v1/music`, Modelle `music_v1`, `music_v2`, `music_v2_5`. `music_v1` ist abgekündigt und wird am 31.01.2027 entfernt. **Für das Projekt: `music_v2_5`.**
- Der Songtext wird über einen *Kompositionsplan* übergeben, also Abschnitte mit Text, Stil und Dauer (je 3–120 s).
- Mehrsprachig, „including … German“. Stilangaben sollen laut Doku auf Englisch formuliert werden.
- Die Antwort ist direkt die Audiodatei (synchron, als Datenstrom). Es gibt keine Auftrags-ID.
- Mindestens 3 Sekunden. ⚠️ Höchstlänge widersprüchlich (5 min vs. 10 min). Für Songs von etwa 3 Minuten ist das unerheblich.
- Formate: MP3 (44,1/48 kHz, bis 192 kbit/s), PCM bis 48 kHz. ⚠️ 44,1-kHz-PCM bzw. „verlustfreies WAV“ laut Preisseite und Rechtetabelle erst ab dem Tarif **Pro**.

**Nutzungsrechte ✅ (Music Terms, Stand 09.10.2026, Anhang A „Music Commercial Rights Table“)**

| | Free | Starter | Creator | Pro | Scale | Business | Enterprise |
|---|---|---|---|---|---|---|---|
| API-Zugang | ✖ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Wer darf den Tarif nutzen** | nur Einzelpersonen | nur Einzelpersonen | nur Einzelpersonen | nur Einzelpersonen | **< 10 Mitarbeitende** | **< 50 Mitarbeitende** | individuell |
| Download-Minuten/Monat | – | 30 | 250 | 500 | 1.500 | 4.000 | individuell |
| Kommerzielle Nutzung online/offline | ✔ (außer Film, TV, Radio, Spiele) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (alles) |
| Streaming-Vertrieb (Spotify o. ä.) | ✖ | ✖ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Namensnennung nötig | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| Preis/Monat (Preisseite) | 0 $ | 6 $ | 22 $ | 99 $ | **299 $** | 990 $ | individuell |

**Bedeutung für dieses Projekt:**
- ✅ Die Tarife bis Pro sind „For Individual Use Only“. Für die **UG mit wenigen Mitarbeitenden** passt **Scale (unter 10 Mitarbeitende, 299 $/Monat)**, ab 10 Mitarbeitenden Business (990 $/Monat).
- ✅ **Kein „Reseller“** (Abschnitt 4.8 i): Wörtlich heißt es, ein Unternehmen werde nicht allein dadurch zum Reseller, dass es Output „through its own product“ erzeugt und verbreitet, solange es die Musikmodelle oder den API-Zugang keinen Dritten zugänglich macht. Das passt zu unserem Modell: Kunden bekommen fertige Songs, aber keinen Zugang zur KI.
- ⚠️ **„Music Library“-Klausel (Abschnitte 4.2, 4.8 f):** Verboten ist, eine Sammlung („any collection of Output“) Dritten „zur Nutzung, Lizenzierung oder zum Download … ob gegen Bezahlung oder nicht“ bereitzustellen. Ein einzelner, personalisierter Song pro Kunde ist eher keine „Sammlung“, der Text entscheidet das aber **nicht eindeutig**. Das Risiko ist geringer als zunächst angenommen; **eine kurze schriftliche Bestätigung von ElevenLabs bleibt empfohlen.**
- ⚠️ Die übergeordneten ElevenLabs-Nutzungsbedingungen („Underlying Agreement“) wurden nicht gelesen und könnten weitere Einschränkungen enthalten.
- ✅ TikTok und Social Media sind erlaubt. Die Kennzeichnungsregeln der Plattform für KI-Inhalte müssen eingehalten werden (Abschnitt 4.4).
- ✅ Verboten sind Prompts mit Künstler- oder Songnamen, Label-Namen und mit wesentlichen Teilen fremder Songtexte (Abschnitt 2.1). Die API meldet dann `bad_prompt`. Das betrifft uns direkt: Kunden könnten „wie Helene Fischer“ oder Liedzeilen eingeben. → Die Eingaben werden gefiltert, und der LLM-Prompt verbietet solche Inhalte.
- ✅ Die Verantwortung für die Prüfung des Outputs vor einer Veröffentlichung liegt beim Nutzer (Abschnitt 3.1).
- ⚠️ Download-Limit: Ein 3-Minuten-Song mit 2 Kandidaten verbraucht 6 Minuten (falls Erzeugen über die API als Download zählt; das ist **ungeklärt**). Bei Scale wären das etwa 250 Bestellungen pro Monat.
- Kosten grob: 900 Credits/Minute laut FAQ. Scale bietet 1,8 Mio. Credits für 299 $, das ergibt etwa **0,90 $ pro Bestellung** bei 2 Kandidaten à 3 min, zuzüglich der monatlichen Grundgebühr.

## 3. Google Lyria – Details

- ✅ Vertex AI: `lyria-3-pro-preview` (ganze Songs, bis 184 s) und `lyria-3-clip-preview` (30 s), beide im Status **Preview** seit 25.03.2026.
- ✅ Gesang, eigene Songtexte, Deutsch (auf Vertex ausdrücklich gelistet). Ausgabe MP3 mit 44,1 kHz/192 kbit/s, SynthID-Wasserzeichen.
- ✅ Gemini API: `lyria-3.5` (ganze Songs, MP3 oder WAV). ⚠️ Status (Preview/GA) und Unterstützung für Deutsch dort nicht ausdrücklich dokumentiert. ⚠️ Unklar, ob `lyria-3.5` dasselbe Modell wie `lyria-3-pro-preview` ist.
- ✅ Vertex-Modellkarte: Kunden dürfen das Modell „für Produktiv- oder kommerzielle Zwecke“ nutzen.
- ✅ Aber Pre-GA-Bedingungen (Google Cloud Service Terms, Abschnitt 5): **„as is“, kann jederzeit ohne Ankündigung geändert oder eingestellt werden, kein SLA, keine Freistellung (Indemnity)**. Die Haftung ist auf höchstens 25.000 $ begrenzt.
- ⚠️ **Datenschutz:** Laut Pre-GA-Bedingungen gilt für Preview-Dienste grundsätzlich *kein* Auftragsverarbeitungsvertrag (Cloud DPA). Die Modellkarte erwähnt den DPA aber. Das ist widersprüchlich und muss juristisch geprüft werden.
- ⚠️ Eigentum am Output: keine Aussage gefunden.
- ⚠️ Preise: Gemini API ca. 0,08 $/Song (aus einer Zusammenfassung der Preisseite, nicht wörtlich gelesen). Die Preise auf Vertex konnten nicht geladen werden.
- **Bewertung:** technisch passend und sehr günstig. Wegen des Preview-Status als **Hauptanbieter riskant**, als **Ausweichanbieter** gut geeignet.

## 4. Mureka – Details

- ✅ `POST /v1/song/generate` mit `lyrics` und Stil-`prompt`. Instrumental-Songs über einen eigenen Endpunkt.
- ✅ Asynchron: Rückgabe einer Auftrags-ID, Abfrage über `GET /v1/song/query/{task_id}`.
- ✅ Sprachen u. a. Deutsch.
- ✅ FAQ: Inhalte aus bezahlten API-Aufrufen haben „full usage rights and commercial authorization“. Guthaben wird einmalig aufgeladen und ist 12 Monate gültig, keine Rückerstattung.
- ⚠️ Nutzungsbedingungen (AGB) nicht lesbar. ⚠️ Weiterverkauf an Endkunden nicht ausdrücklich geregelt. ⚠️ Formate, Preis pro Song, Firmensitz und damit Drittlandtransfer nicht gefunden.
- **Bewertung:** Kandidat 3, erst nach Prüfung der AGB.

## 4a. Eigene KI auf eigenem Server („self-hosted“)

Statt einen Anbieter zu bezahlen, kann man ein frei verfügbares Musikmodell auf einem eigenen Server betreiben.

### ACE-Step 1.5 – geeigneter Kandidat
- ✅ **Lizenz MIT** für Code und laut Hugging-Face-Karte auch für die Modellgewichte. Die Modellkarte sagt wörtlich, man könne die erzeugte Musik „strictly … for commercial purposes“ nutzen.
- ✅ Songs **mit Gesang aus eigenem Songtext**, 10 Sekunden bis 10 Minuten.
- ⚠️ „50+ Sprachen“. **Deutsch ist nicht ausdrücklich aufgeführt**, ebenso fehlen Qualitätsangaben für andere Sprachen als Englisch. → **Ein Hörtest mit deutschen Texten ist Pflicht.**
- ⚠️ Trainingsdaten laut Entwickler: lizenzierte Musik, gemeinfreie bzw. lizenzfreie Musik und synthetische Daten. Das ist eine Selbstauskunft und **nicht unabhängig geprüft**.
- ⚠️ Haftungsausschluss der Entwickler: Sie räumen das Risiko einer „unintentional copyright infringement due to stylistic similarity“ ein und übernehmen keine Verantwortung. Es gibt **keine Freistellung**. Das Risiko trägt man selbst.
- **Hardware:** Laut Entwickler läuft es mit unter 4 GB Grafikspeicher (mit Einschränkungen). Ein Song dauert auf einer RTX 3090 unter 10 Sekunden. Ohne Grafikkarte (nur CPU) ist es möglich, die Geschwindigkeit ist aber nicht angegeben und vermutlich langsam.
- **Wo betreiben?** Das Strato-Webhosting scheidet aus. Nötig ist ein Server **mit Grafikkarte** (GPU-Server bei einem Cloud-Anbieter, monatlich oder pro Minute abgerechnet). ⚠️ Kosten der GPU-Anbieter wurden nicht geprüft.
- **Stand 08.11.2026:** Der PC des Auftraggebers hat eine Quadro M1000M mit 2 GB Grafikspeicher. Das ist zu wenig und zu alt, ein lokaler Test scheidet aus. Die Hetzner Cloud bietet nach meinem Stand keine GPU-Server an (⚠️ nicht geprüft). Für den Hörtest müsste ein GPU-Rechner stundenweise gemietet werden. Für einen Dauerbetrieb käme ein dedizierter GPU-Server in Frage, z. B. bei Hetzner außerhalb der Cloud.
- **Bewertung:** Lizenzrechtlich die **klarste** Lösung, weil keine Fremd-AGB im Weg stehen. Dafür ist die Qualität im Deutschen ungewiss, und Betrieb, Updates und Überwachung liegen bei uns. **Empfehlung:** als Adapter `selfhosted` einplanen und per Hörtest gegen ElevenLabs vergleichen, bevor der Hauptanbieter festgelegt wird.

### YuE – ausgeschlossen
- ⛔ Der Code steht unter Apache 2.0, die **Modellgewichte** laut mehreren Quellen aber unter **CC BY-NC 4.0 (nicht kommerziell)**. ⚠️ Nicht direkt beim Original geprüft, für uns aber ohnehin unpassend.

### Anbieter, deren AGB den Weiterverkauf ausdrücklich erlauben?
- Eine Recherche ergab **keinen** Anbieter mit Gesang, der den Verkauf personalisierter Songs an Endkunden in öffentlich lesbaren AGB **ausdrücklich** erlaubt. Solche Rechte werden üblicherweise in Unternehmensverträgen vereinbart.
- Am nächsten kommen **ElevenLabs** (ausdrücklich „kein Reseller“ beim Vertrieb über das eigene Produkt, siehe Abschnitt 2) und **Stability AI** („You own your outputs, and can distribute and commercialize them freely“, aber ohne Gesang).

## 5. Ausgeschlossen

- ⛔ **Suno:** Laut Music Business Worldwide (02.07.2026) gibt es **keine öffentliche offizielle API**, nur ein Partnerprogramm „in Erkundung“. Inoffizielle Wrapper verstoßen gegen Pflichtenheft Abschnitt 7 (keine inoffizielle Automatisierung). ⚠️ Eine Quelle vom September 2026 nennt eine Seite `platform.suno.com`. Das ist nicht bestätigt. Falls Suno eine offizielle API startet, kann sie über das Adapter-Interface nachgerüstet werden.
- ⛔ **Stable Audio (Stability AI):** laut Doku „not intended to generate intelligible vocals“, also ungeeignet für Songs mit Text.
- ⛔ **Lyria 2 (`lyria-002`):** nur instrumental, 30 s.
- Nicht geprüft: Udio und weitere Anbieter. Sie können bei Bedarf ergänzt werden.

---

## 6. Mollie (Zahlung) ✅

- **Payments API** verwenden. Die **Orders API wird nicht mehr empfohlen** („We no longer recommend using the Orders API“).
- Optional können Positionen (`lines`) mitgegeben werden. Sie sind Pflicht u. a. für Klarna, Billie, in3 und Riverty.
- **Klassische Webhooks:** Mollie sendet nur `id=tr_…` und trägt **keine Signatur**. Der Server **muss** den Status per API abrufen. Das schützt gegen gefälschte Aufrufe, denn eine gefälschte ID führt höchstens zu einer Abfrage ohne Wirkung.
- **Next-gen-Webhooks:** signiert per `X-Mollie-Signature` (HMAC-SHA256). ⚠️ Laut Doku sind für Zahlungs-Updates derzeit noch klassische Webhooks empfohlen. Die Angaben sind widersprüchlich, deshalb nutzt die erste Version klassische Webhooks mit Statusabruf.
- Wiederholungen: bis zu 10 Versuche über etwa 26 Stunden. Der Webhook muss innerhalb von 15 Sekunden mit `200 OK` antworten. Deshalb wird dort nur der Status gespeichert, die eigentliche Arbeit macht der Worker.
- **Idempotenz:** Header `Idempotency-Key` bei allen POST-Anfragen, gültig 1 Stunde.
- **Testmodus:** API-Schlüssel `test_…`, vollständig getrennt von Live-Daten, mit simulierter Bezahlseite. Im Testmodus braucht der Webhook kein HTTPS, im Livebetrieb schon.
- **Rückerstattungen:** `POST /v2/payments/{id}/refunds`.
- ⚠️ Welche Zahlungsarten in Deutschland konkret für das eigene Konto freigeschaltet sind (PayPal, Karte, Apple Pay, Klarna …), zeigt erst das Mollie-Konto. SOFORT und Giropay stehen nicht mehr in der Liste.
- ⚠️ Gebühren und Rechnungsstellung (Belege) nicht geprüft.

## 7. Songtext-KI (LLM)

- Vorschlag: **Anthropic Claude**, Modell `claude-opus-5-5` (aktuelles Standardmodell), Preis 4 $ pro 1 Mio. Eingabe-Tokens und 20 $ pro 1 Mio. Ausgabe-Tokens.
  Grobe Schätzung: ein Songtext mit Korrekturrunden kostet **ca. 0,02–0,10 $**.
- **Strukturierte Ausgabe** (`output_config.format` mit JSON-Schema) liefert Titel, Abschnitte und Zeilen in festem Format. Daraus wird direkt der Kompositionsplan für die Musik-KI.
- Hinweis: Claude kann Anfragen in seltenen Fällen ablehnen (`stop_reason: "refusal"`). Der Adapter behandelt das und setzt die Bestellung dann auf manuelle Prüfung.
- ⚠️ Nicht im Detail geprüft: Nutzungsbedingungen zu Eigentum am Output, Datenverarbeitung in der EU und Auftragsverarbeitungsvertrag. Das wird vor dem Livegang nachgeholt (Modul M6).
- Das LLM ist austauschbar. Der Mock-Adapter funktioniert ohne Zugang.

## 8. Dropbox / EasyGMV / TikTok (Phase C)

- **Dropbox ✅ (Doku geprüft):**
  - Zugriffsart „App folder“: Die App kann nur in `/Apps/<App-Name>/` lesen und schreiben. Mit „Full Dropbox“ kann sie jeden Ordner nutzen.
  - Berechtigungen: Hochladen braucht `files.content.write`, Ordner auflisten `files.metadata.read`.
  - Zugriffstoken sind kurzlebig. Mit `token_access_type=offline` erhält man ein Refresh-Token für eine dauerhafte Verbindung.
  - Upload: bis 150 MiB in einem Aufruf, größere Dateien über eine Upload-Session in Teilen.
  - ⚠️ Die genaue Laufzeit der Zugriffstoken steht nicht in der Doku. Sie wird bei der Abfrage geliefert.
- **EasyGMV:** laut Auftraggeber nicht weiter relevant. EasyGMV holt die Videos selbst aus dem gewählten Dropbox-Ordner. Ein Metadatenformat ist nicht nötig.
- TikTok: KI-generierte Inhalte müssen gemäß den Plattformregeln gekennzeichnet werden. Auch ElevenLabs verlangt das in Abschnitt 4.4 der Music Terms.

---

## 9. Quellen (abgerufen 08.11.2026)

- ElevenLabs Music – Übersicht: https://elevenlabs.io/docs/overview/capabilities/music
- ElevenLabs – API Compose: https://elevenlabs.io/docs/api-reference/music/compose
- ElevenLabs – Music Terms: https://elevenlabs.io/music-terms
- ElevenLabs – Preise: https://elevenlabs.io/pricing
- Google – Lyria 3 auf Vertex AI (Blog): https://cloud.google.com/blog/products/ai-machine-learning/lyria-3-and-lyria-3-pro-on-vertex-ai/
- Google – Lyria-3-Modellkarte: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/lyria/lyria-3
- Google – Musikgenerierung (Gemini API): https://aistudio.google.com/docs/music-generation
- Google Cloud Service Terms (Pre-GA): https://cloud.google.com/terms/service-terms
- Mureka – FAQ: https://platform.mureka.ai/docs/en/faq.html · Quickstart: https://platform.mureka.ai/docs/en/quickstart.html
- Stability AI – Stable Audio: https://docs.stability.ai/stable-audio.md
- Suno (Bericht): https://www.musicbusinessworldwide.com/suno-explores-developer-api-seeking-apps-that-unlock-experiences-generative-music-makes-possible-for-the-first-time/
- Mollie – Create Payment: https://docs.mollie.com/reference/create-payment
- Mollie – Webhooks: https://docs.mollie.com/reference/webhooks · Next-gen: https://docs.mollie.com/reference/webhooks-new
- Mollie – Idempotenz: https://docs.mollie.com/reference/api-idempotency · Testen: https://docs.mollie.com/docs/testing
- Mollie – Orders API (Hinweis): https://docs.mollie.com/reference/v2/orders-api/create-order
- ACE-Step 1.5: https://github.com/ace-step/ACE-Step-1.5 · https://huggingface.co/ACE-Step/Ace-Step1.5
- Dropbox OAuth: https://docs.dropboxapi.com/dropbox-api/docs/oauth · Developer Guide: https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide
- Dropbox Upload: https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/upload.md
- Strato Node.js-Hosting: https://www.strato.de/server/node-js-hosting/
