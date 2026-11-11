import type { Metadata } from "next";
import { Suspense } from "react";
import { Address, companyForLegal, LegalPage } from "@/legal/legal-page";

export const metadata: Metadata = { title: "Datenschutzerklärung – melomio" };

/**
 * Datenschutzerklärung nach Art. 13 DSGVO. ⚠️ Entwurf – juristisch prüfen (F-24).
 * Bei neuen Anbietern oder Datenflüssen hier ergänzen (Übersicht: docs/ARCHITEKTUR.md).
 */
export default function Page() {
  return (
    <LegalPage title="Datenschutzerklärung">
      <Suspense fallback={<p>…</p>}>
        <Privacy />
      </Suspense>
    </LegalPage>
  );
}

async function Privacy() {
  const c = await companyForLegal();
  return (
    <>
      <h2>1. Verantwortlicher</h2>
      <Address c={c} />
      <p>
        Vertreten durch: {c.managingDirector}
        <br />
        E-Mail: <a href={`mailto:${c.email}`}>{c.email}</a>
      </p>
      <p>
        Für Fragen zum Datenschutz und zur Ausübung Ihrer Rechte schreiben Sie uns an die oben genannte
        E-Mail-Adresse.
      </p>

      <h2>2. Überblick</h2>
      <p>
        melomio erstellt personalisierte Songs mit Video. Dafür verarbeiten wir die Daten, die Sie uns geben
        (Konto, Fragebogen, Songtext), und Daten, die bei der Nutzung technisch anfallen. Wir verwenden keine
        Werbe- oder Analyse-Cookies und keine Tracking-Dienste. Schriften werden von unserem eigenen Server
        geladen.
      </p>

      <h2>3. Welche Daten wir verarbeiten und warum</h2>
      <h3>Website und Server</h3>
      <p>
        Beim Aufruf der Website verarbeitet unser Server technisch notwendige Daten (IP-Adresse, Zeitpunkt,
        aufgerufene Seite, Browserangaben), um die Seite auszuliefern und vor Angriffen zu schützen, z. B.
        durch Begrenzung von Anmeldeversuchen. Rechtsgrundlage ist unser berechtigtes Interesse an einem
        sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Diese Daten werden nur kurzfristig gespeichert.
      </p>
      <h3>Kundenkonto</h3>
      <p>
        Für eine Bestellung ist ein Konto nötig. Wir speichern E-Mail-Adresse, optional Ihren Namen und Ihr
        Passwort (nur als sicherer Hash). Rechtsgrundlage ist die Vertragserfüllung (Art. 6 Abs. 1 lit. b
        DSGVO).
      </p>
      <h3>Fragebogen, Songtext, Song und Video</h3>
      <p>
        Ihre Antworten im Fragebogen, Ihre Stilauswahl, der Songtext und die daraus erstellten Dateien werden
        gespeichert, um Ihren Song zu erstellen und bereitzustellen (Art. 6 Abs. 1 lit. b DSGVO). Ihre
        Antworten können Angaben über andere Personen enthalten (z. B. Namen oder gemeinsame Erlebnisse).
        Bitte geben Sie nur Angaben an, die Sie dafür verwenden dürfen, und keine besonders sensiblen Daten
        (z. B. zur Gesundheit).
      </p>
      <h3>Fotos für das Video</h3>
      <p>
        Wenn Sie Fotos hochladen, verwenden wir sie nur für Ihr Video. Beim Hochladen entfernen wir
        automatisch Metadaten wie Standort (GPS) und Kameradaten. Fotos werden nicht an KI-Anbieter
        übermittelt. Sie werden zusammen mit der Hörprobe gelöscht, wenn Sie nicht kaufen, und sonst mit Ihrem
        Konto. Bitte laden Sie nur Fotos hoch, die Sie verwenden dürfen.
      </p>
      <h3>Bestellung, Zahlung und Rechnung</h3>
      <p>
        Wir speichern Bestelldaten, Preis, Zahlungsstatus und Rechnungen sowie Ihre beim Kauf abgegebenen
        Bestätigungen (mit Zeitpunkt und Textfassung; statt der IP-Adresse nur ein nicht zurückrechenbarer
        Wert). Rechtsgrundlagen sind Vertragserfüllung und gesetzliche Pflichten (Art. 6 Abs. 1 lit. b und c
        DSGVO).
      </p>
      <h3>E-Mails</h3>
      <p>
        Wir senden Ihnen E-Mails zur Anmeldung, zur Bestellung und zur Fertigstellung Ihres Songs. Diese
        E-Mails sind für das Konto und den Vertrag notwendig (Art. 6 Abs. 1 lit. b DSGVO). Newsletter
        versenden wir nicht.
      </p>
      <h3>Song-Seite zum Teilen</h3>
      <p>
        Wenn Sie die Song-Seite einschalten, ist sie für alle erreichbar, die den Link kennen. Sie zeigt
        Titel, Songtext, Song und Video. Sie können die Seite jederzeit wieder abschalten.
      </p>
      <h3>Freiwillige Veröffentlichung</h3>
      <p>
        Wenn Sie beim Kauf zustimmen, veröffentlichen wir das Video nach unserer Prüfung auf eigenen Kanälen in
        sozialen Netzwerken (Art. 6 Abs. 1 lit. a DSGVO). Fotos und der Songtitel erscheinen nur, wenn Sie das
        gewählt haben. Dazu übergeben wir das Video an Dropbox und unseren Veröffentlichungsdienst. Sie können
        die Einwilligung jederzeit auf Ihrer Bestellseite widerrufen; wir veröffentlichen dann nichts mehr und
        entfernen bereits übergebene Videos.
      </p>
      <h3>Partnerprogramm</h3>
      <p>
        Für Partner (Affiliates) verarbeiten wir Name, Anschrift, Bankverbindung und steuerliche Angaben zur
        Abrechnung der Provisionen (Art. 6 Abs. 1 lit. b und c DSGVO). Gutschriften bewahren wir nach den
        gesetzlichen Fristen auf. Partner erhalten von Kunden nur Bestellnummern und Beträge.
      </p>

      <h2>4. Cookies</h2>
      <p>
        Wir setzen nur technisch notwendige Cookies: ein Anmelde-Cookie, damit Sie angemeldet bleiben, und ein
        Cookie, das Ihren Fragebogen-Entwurf vor der Anmeldung zuordnet (höchstens 30 Tage). Rechtsgrundlage
        ist § 25 Abs. 2 Nr. 2 TDDDG in Verbindung mit Art. 6 Abs. 1 lit. b und f DSGVO.
      </p>

      <h2>5. Empfänger und Dienstleister</h2>
      <p>
        Wir setzen folgende Dienstleister ein, mit denen – soweit erforderlich – Verträge zur
        Auftragsverarbeitung bestehen:
      </p>
      <ul>
        <li>
          <strong>Hetzner Online GmbH</strong>, Gunzenhausen (Deutschland): Hosting von Website, Datenbank und
          Dateien. Die Server stehen in Deutschland.
        </li>
        <li>
          <strong>STRATO</strong>, Berlin (Deutschland): Versand unserer E-Mails.
        </li>
        <li>
          <strong>Mollie B.V.</strong>, Amsterdam (Niederlande): Zahlungsabwicklung. Ihre Zahlungsdaten (z. B.
          Karten- oder Kontodaten) gibt Mollie bzw. der jeweilige Zahlungsanbieter nicht an uns weiter. Mollie
          ist für Teile der Zahlungsabwicklung selbst verantwortlich.
        </li>
        <li>
          <strong>Anthropic PBC</strong>, San Francisco (USA): Erstellung des Songtextes mit KI. Übermittelt
          werden Anlass, Ihre Antworten im Fragebogen und die Stilauswahl, nicht Ihre E-Mail-Adresse. Die
          Übermittlung in die USA erfolgt auf Grundlage von EU-Standardvertragsklauseln. [⚠️ Rechtsgrundlage
          und Speicherdauer beim Anbieter prüfen]
        </li>
        <li>
          <strong>Mureka</strong> [⚠️ Betreiber, Sitz und Rechtsgrundlage der Übermittlung prüfen]: Erstellung
          der Musik mit KI. Übermittelt werden der freigegebene Songtext und die Stilbeschreibung, nicht Ihre
          E-Mail-Adresse.
        </li>
        <li>
          <strong>Dropbox</strong> (Dropbox International Unlimited Company, Dublin, Irland) und
          <strong> EasyGMV</strong> [⚠️ Betreiber und Vertrag prüfen]: nur bei freiwilliger Veröffentlichung –
          Ablage und Veröffentlichung des Videos.
        </li>
      </ul>
      <p>
        Eine Weitergabe an sonstige Dritte erfolgt nur, wenn wir gesetzlich dazu verpflichtet sind (z. B. an
        Finanzbehörden).
      </p>

      <h2>6. Speicherdauer</h2>
      <ul>
        <li>Fragebogen-Entwürfe ohne Anmeldung: 30 Tage.</li>
        <li>Hörproben ohne Kauf: Löschung nach einer festgelegten Frist (derzeit 14 Tage).</li>
        <li>Konto, Bestellungen, Song und Video: bis zur Löschung Ihres Kontos.</li>
        <li>
          Rechnungen und steuerlich relevante Unterlagen: gesetzliche Aufbewahrungsfristen (in der Regel 8
          bzw. 10 Jahre); diese Daten werden bis dahin gesperrt aufbewahrt.
        </li>
      </ul>

      <h2>7. Ihre Rechte</h2>
      <p>
        Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17),
        Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen
        Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21). In Ihrem Konto können Sie Ihre Daten
        selbst herunterladen und Ihr Konto löschen. Sie haben außerdem das Recht, sich bei einer
        Datenschutz-Aufsichtsbehörde zu beschweren, z. B. bei der Behörde Ihres Wohnorts oder unseres Sitzes.
      </p>

      <h2>8. Keine automatisierte Entscheidung</h2>
      <p>
        Wir treffen keine Entscheidungen, die Ihnen gegenüber rechtliche Wirkung entfalten, ausschließlich
        automatisiert (Art. 22 DSGVO). Die KI erstellt Inhalte; Bestellungen werden nur abgelehnt, wenn
        Inhalte gegen unsere AGB verstoßen.
      </p>

      <h2>9. Pflicht zur Bereitstellung</h2>
      <p>
        Die Angabe Ihrer E-Mail-Adresse und Ihrer Antworten ist für die Bestellung erforderlich. Ohne diese
        Daten können wir keinen Song erstellen.
      </p>
    </>
  );
}
