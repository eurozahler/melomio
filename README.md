# melomio

Personalisierte KI-Songs mit Musikvideo für besondere Anlässe.

- Anforderungen: [Pflichtenheft](Pflichtenheft_KI_Song_Plattform_Claude_Code.md)
- Technik: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)
- Plan und Stand: [docs/ENTWICKLUNGSPLAN.md](docs/ENTWICKLUNGSPLAN.md)
- Entscheidungen und offene Fragen: [docs/OFFENE_FRAGEN.md](docs/OFFENE_FRAGEN.md)
- Testserver: [infra/testserver/README.md](infra/testserver/README.md)

## Lokal starten

1. Einmalig: `npm install` und `.env.example` nach `.env.local` kopieren und ausfüllen.
2. In einem eigenen Terminal den Datenbank-Tunnel öffnen: `.\scripts\db-tunnel.ps1` (ab Modul M2 nötig).
3. In einem weiteren Terminal den Hintergrund-Worker starten: `npm run worker` (ab Modul M4 nötig, damit Bestellungen weiterlaufen).
4. `npm run dev` und im Browser http://localhost:3000 öffnen.

Den Worker beendest du mit **Strg+C** in seinem Terminal – dann bringt er laufende Aufträge noch zu Ende. Wird er hart beendet (Absturz), werden abgebrochene Aufträge nach dem Neustart automatisch wiederholt (nach etwa 1–3 Minuten).

## Befehle

| Befehl             | Zweck                                                               |
| ------------------ | ------------------------------------------------------------------- |
| `npm run dev`      | Entwicklungsserver                                                  |
| `npm run build`    | Produktions-Build                                                   |
| `npm run check`    | Alles prüfen: Typen, Lint, Formatierung, Tests                      |
| `npm test`         | Unit-Tests                                                          |
| `npm run test:e2e` | Browser-Tests in Handy-Größe gegen die Testdatenbank (Tunnel nötig) |
| `npm run format`   | Code automatisch formatieren                                        |

### Datenbank (Tunnel muss offen sein)

| Befehl                     | Zweck                                                             |
| -------------------------- | ----------------------------------------------------------------- |
| `npm run db:overview`      | Übersicht: Tabellen, Anlässe mit Fragen, Katalog, Einstellungen   |
| `npm run db:migrate`       | Fehlende Migrationen einspielen                                   |
| `npm run db:seed`          | Beispieldaten einspielen (wiederholbar, überschreibt nichts)      |
| `npm run db:generate`      | Nach Schemaänderung eine neue Migration erzeugen                  |
| `npm run test:integration` | Tests gegen die Testdatenbank (wird dabei komplett neu aufgebaut) |

## Testbetrieb

Solange `APP_MODE=test` gilt oder ein Test-Adapter (Mock) aktiv ist, zeigt jede Seite das Banner **TESTBETRIEB**.
Mit `APP_MODE=live` startet die App nur, wenn kein Mock aktiv ist und kein Mollie-Testschlüssel verwendet wird.
