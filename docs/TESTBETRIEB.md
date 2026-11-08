# melomio im Testbetrieb – kurze Bedienungsanleitung

Stand: 08.11.2026 (erste Version, Module M0–M11). Im Testbetrieb entstehen **keine Kosten**, außer du schaltest selbst einen echten Baustein ein (z. B. Claude für Songtexte).

## 1. Starten auf deinem PC

Du brauchst drei Fenster im Projektordner `C:\dev\songgen`:

| Fenster | Befehl                      | Wozu                                                     |
| ------- | --------------------------- | -------------------------------------------------------- |
| 1       | `.\scripts\db-tunnel.ps1`   | Verbindung zur Datenbank auf dem Testserver (offen lassen) |
| 2       | `npm run dev`               | die Webseite unter http://localhost:3000                 |
| 3       | `npm run worker`            | erledigt die Arbeit im Hintergrund: Songtext, Musik, Video, E-Mails |

**Wichtig:** Nach jeder Programmänderung den Worker neu starten (`Strg+C`, dann wieder `npm run worker`). In der ersten Zeile steht der Programmstand, z. B. `[worker] bereit · Stand 0c82d8f`.

## 2. Einmal komplett durchspielen

1. **Startseite** → Anlass wählen → Fragebogen ausfüllen (ohne Anmeldung möglich).
2. **Registrieren.** Die Bestätigungs-E-Mail landet im Test-Postfach: http://localhost:3000/dev/mailbox. Dort den Link anklicken.
3. **Songtext:** Er entsteht in wenigen Sekunden. Du kannst ihn selbst bearbeiten (unbegrenzt) oder einmal von der KI neu formulieren lassen. Danach **freigeben**.
4. **Hörprobe:** 20 Sekunden mit Signalton als Wasserzeichen. Im Testbetrieb ist die „Musik“ ein künstlicher Ton und kein echter Song.
5. **Kaufen:** beide Haken setzen → „Zahlungspflichtig bestellen“ → auf der Test-Bezahlseite „Zahlung erfolgreich“ wählen. Es fließt kein Geld.
6. **Fertig:** Nach etwa einer Minute sind Song und Video da. Du kannst sie herunterladen und eine **Song-Seite zum Teilen** mit QR-Code einschalten. Die E-Mails „Bestellbestätigung“ und „Song fertig“ stehen im Test-Postfach.

## 3. Admin-Bereich

- Einmalig die Rolle vergeben (Konto muss registriert sein): `npm run admin:rolle -- deine@adresse.de owner`
- Dann http://localhost:3000/admin öffnen:
  - **Übersicht:** Hörproben, Käufe, Kaufquote, geschätzte Kosten, Bestellungen mit Problemen.
  - **Bestellungen:** suchen und filtern, Detail mit Verlauf, Songtext und Musik-Kandidaten zum Anhören.
    - „**Schritt wiederholen**“ erscheint bei Fehlern.
    - „**Kandidat freigeben**“ erscheint, wenn die automatische Prüfung unsicher war.
  - **Einstellungen:** Preis, Anzahl KI-Neuformulierungen, Hörproben pro Konto, Tagesbudget und mehr. Jede Änderung steht im **Änderungsprotokoll**.

## 4. Echte Bausteine einschalten (nur mit Absprache)

Einstellungen in `.env.local`. Schlüssel trägst du **selbst** ein, nie in den Chat:

| Baustein              | Einstellung                                   | Kosten                          |
| --------------------- | --------------------------------------------- | ------------------------------- |
| Songtext mit Claude   | `LYRICS_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` | wenige Cent pro Songtext (⚠️ messen) |
| Zahlung Mollie (Test) | `PAYMENT_PROVIDER=mollie` + `MOLLIE_API_KEY=test_…` | keine (Testmodus)            |
| Echte E-Mails         | `EMAIL_PROVIDER=smtp` + `SMTP_*`              | im Strato-Paket                 |
| Echte Musik           | noch nicht umgesetzt (Anbieter offen, F-2)    | –                               |

Danach Webseite **und** Worker neu starten.

## 5. Automatische Tests

| Befehl                      | Was                                                         | Dauer   |
| --------------------------- | ----------------------------------------------------------- | ------- |
| `npm run check`             | Typen, Regeln, Formatierung, Unit-Tests                     | ~1 Min. |
| `npm run test:integration`  | Abläufe gegen die Testdatenbank (Tunnel muss laufen)        | ~4 Min. |
| `npm run test:e2e`          | alles im Handy-Browser: Fragebogen bis Download, Admin, Barrierefreiheit | ~5 Min. |

## 6. Wenn etwas hängt

- **Status bewegt sich nicht:** Läuft der Worker? Läuft der Tunnel? Ist der Worker auf dem neuesten Stand (erste Zeile)?
- **Bestellung „Fehler“:** im Admin öffnen → „Schritt wiederholen“.
- **„Zu viele Hörproben“:** im Admin unter Einstellungen „Hörproben pro Konto“ erhöhen.
