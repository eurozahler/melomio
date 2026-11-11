import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Address, companyForLegal, LegalPage } from "@/legal/legal-page";

export const metadata: Metadata = { title: "AGB – melomio" };

/**
 * Allgemeine Geschäftsbedingungen. ⚠️ Entwurf nach gängigen Mustern – juristisch prüfen (F-24).
 * Offene Punkte stehen in docs/OFFENE_FRAGEN.md (Nutzungsrechte, Mindestalter, Bereitstellungsdauer).
 */
export default function Page() {
  return (
    <LegalPage title="Allgemeine Geschäftsbedingungen">
      <Suspense fallback={<p>…</p>}>
        <Terms />
      </Suspense>
    </LegalPage>
  );
}

async function Terms() {
  const c = await companyForLegal();
  return (
    <>
      <h2>§ 1 Geltungsbereich und Anbieter</h2>
      <p>
        Diese Allgemeinen Geschäftsbedingungen gelten für alle Verträge, die über die Website melomio.de
        („melomio“) geschlossen werden. Anbieter und Vertragspartner ist:
      </p>
      <Address c={c} />
      <p>
        E-Mail: <a href={`mailto:${c.email}`}>{c.email}</a>
      </p>
      <p>
        Abweichende Bedingungen des Kunden gelten nicht. Verbraucher ist jede natürliche Person, die ein
        Rechtsgeschäft zu Zwecken abschließt, die überwiegend weder ihrer gewerblichen noch ihrer
        selbständigen beruflichen Tätigkeit zugerechnet werden können (§ 13 BGB).
      </p>

      <h2>§ 2 Leistungen von melomio</h2>
      <p>
        melomio erstellt auf Grundlage der Angaben des Kunden einen personalisierten Song mit Video als
        digitalen Inhalt. Songtext, Musik und Gesang werden mit Hilfe künstlicher Intelligenz (KI) erzeugt.
        Ablauf:
      </p>
      <ul>
        <li>Der Kunde beantwortet einen Fragebogen und wählt Musikstil, Stimmung und Stimmbeschreibung.</li>
        <li>
          melomio erstellt einen Songtext, den der Kunde lesen, im Rahmen der angebotenen Möglichkeiten ändern
          und freigeben kann. Erst der freigegebene Text wird vertont.
        </li>
        <li>Vor dem Kauf erhält der Kunde eine kostenlose Hörprobe von etwa 20 Sekunden.</li>
        <li>
          Nach dem Kauf kann melomio zusätzlich eine zweite, anders klingende Version desselben Songtexts
          erstellen. Der Kunde wählt dann seine Lieblingsversion; wählt er nicht innerhalb von 7 Tagen, gilt
          die Version der Hörprobe.
        </li>
        <li>Der Kunde erhält den vollständigen Song (MP3) und ein Video (MP4).</li>
      </ul>
      <p>
        Stilangaben wie „warme Männerstimme“ sind Beschreibungen für die KI und keine Zusage einer bestimmten
        Stimme. Da KI-Ergebnisse nicht exakt vorhersehbar sind, können Klang, Melodie, Länge und Aussprache
        variieren. Der Kunde kann sich vor dem Kauf anhand der Hörprobe ein Bild machen. Der fertige Song
        entspricht dem Song, aus dem die Hörprobe stammt, oder der vom Kunden gewählten zweiten Version.
      </p>
      <p>
        Für eine Bestellung ist ein Kundenkonto mit bestätigter E-Mail-Adresse erforderlich. Die Zahl
        kostenloser Hörproben je Konto ist begrenzt. Song und Video bleiben im Kundenkonto abrufbar, solange
        das Konto besteht.
      </p>
      <p>
        Kunden müssen mindestens 18 Jahre alt sein. Minderjährige dürfen nur mit Zustimmung ihrer
        Erziehungsberechtigten bestellen; mit der Bestellung bestätigen sie, dass diese Zustimmung vorliegt.
      </p>

      <h2>§ 3 Vertragsschluss</h2>
      <p>
        Die Darstellung auf der Website ist kein verbindliches Angebot. Mit Klick auf „Zahlungspflichtig
        bestellen“ gibt der Kunde ein verbindliches Angebot zum Kauf des Songs ab. Der Vertrag kommt zustande,
        wenn die Zahlung erfolgreich abgeschlossen ist und melomio die Bestellbestätigung per E-Mail
        versendet. Der Vertragstext (Bestelldaten und diese AGB in der jeweils gültigen Fassung) wird von uns
        gespeichert; die Bestelldaten erhält der Kunde mit der Bestellbestätigung. Vertragssprache ist
        Deutsch.
      </p>

      <h2>§ 4 Preise und Zahlung</h2>
      <p>
        Es gelten die zum Zeitpunkt der Bestellung angezeigten Preise. Alle Preise sind Endpreise in Euro
        einschließlich der gesetzlichen Umsatzsteuer. Versandkosten fallen nicht an. Die Zahlung erfolgt im
        Voraus über unseren Zahlungsdienstleister Mollie B.V. mit den dort angebotenen Zahlungsarten. Nach der
        Zahlung erhält der Kunde eine Rechnung per E-Mail und im Kundenkonto.
      </p>

      <h2>§ 5 Bereitstellung</h2>
      <p>
        Song und Video werden in der Regel innerhalb weniger Minuten nach Zahlungseingang im Kundenkonto zum
        Anschauen und Herunterladen bereitgestellt; der Kunde wird per E-Mail benachrichtigt. Kommt es zu
        technischen Verzögerungen, informieren wir den Kunden. Wir empfehlen, Song und Video herunterzuladen
        und selbst zu sichern.
      </p>

      <h2>§ 6 Widerrufsrecht</h2>
      <p>
        Verbrauchern steht ein Widerrufsrecht nach Maßgabe der{" "}
        <Link href="/widerruf">Widerrufsbelehrung</Link> zu. Das Widerrufsrecht erlischt vorzeitig, wenn der
        Kunde beim Kauf ausdrücklich zustimmt, dass melomio vor Ablauf der Widerrufsfrist mit der Ausführung
        beginnt, und seine Kenntnis vom Verlust des Widerrufsrechts bestätigt.
      </p>

      <h2>§ 7 Pflichten des Kunden zu seinen Angaben</h2>
      <p>
        Der Kunde ist für seine Angaben im Fragebogen und für Änderungen am Songtext verantwortlich. Er
        versichert, dass
      </p>
      <ul>
        <li>er die Angaben über andere Personen (z. B. Namen, Erlebnisse) verwenden darf,</li>
        <li>die Inhalte keine Rechte Dritter verletzen, insbesondere keine fremden Liedtexte enthalten,</li>
        <li>
          die Inhalte nicht beleidigend, diskriminierend, gewaltverherrlichend, pornografisch oder sonst
          rechtswidrig sind.
        </li>
      </ul>
      <p>
        melomio darf Bestellungen ablehnen oder vor der Zahlung abbrechen, wenn Angaben gegen diese Regeln
        verstoßen oder die KI-Anbieter die Erstellung verweigern. Namen bekannter Künstler oder Marken werden
        aus den Angaben automatisch entfernt.
      </p>

      <h2>§ 8 Nutzungsrechte</h2>
      <p>
        Mit vollständiger Zahlung erhält der Kunde das zeitlich, räumlich und inhaltlich unbeschränkte, nicht
        ausschließliche Recht, Song und Video zu nutzen, zu bearbeiten und zu veröffentlichen, privat wie
        kommerziell. Dazu gehören insbesondere das Abspielen auf Feiern, das Verschenken, das Teilen in
        sozialen Netzwerken und über die Song-Seite von melomio, die Nutzung in Werbung und die
        Veröffentlichung über Musik-Streaming-Dienste.
      </p>
      <p>
        Für KI-erzeugte Inhalte besteht nach geltender Rechtslage unter Umständen kein Urheberrechtsschutz;
        melomio übernimmt keine Gewähr dafür, dass Dritte ähnliche Inhalte nicht ebenfalls nutzen, und keine
        Gewähr dafür, dass Plattformen zur Inhaltserkennung den Song nicht anderen Inhalten zuordnen. melomio
        behält das Recht, Song und Video für die vom Kunden gewählte Veröffentlichung (§ 9) zu nutzen.
      </p>

      <h2>§ 9 Freiwillige Veröffentlichung</h2>
      <p>
        Der Kunde kann beim Kauf freiwillig zustimmen, dass melomio das Video auf eigenen Kanälen in sozialen
        Netzwerken (z. B. TikTok) veröffentlicht. Dafür kann melomio einen Preisnachlass gewähren, der vor dem
        Kauf angezeigt wird. Der Kunde wählt, ob seine Fotos und der Songtitel im veröffentlichten Video
        erscheinen. Der gesungene Text ist im Song hörbar. Fotos darf der Kunde nur freigeben, wenn alle
        abgebildeten Personen einverstanden sind. Jede Veröffentlichung wird von melomio vorher geprüft; ein
        Anspruch auf Veröffentlichung besteht nicht.
      </p>
      <p>
        Der Kunde kann seine Zustimmung jederzeit für die Zukunft im Kundenkonto oder per E-Mail widerrufen.
        Bereits veröffentlichte Videos entfernt melomio dann innerhalb angemessener Frist. Ein gewährter
        Preisnachlass bleibt davon unberührt.
      </p>

      <h2>§ 10 Gewährleistung</h2>
      <p>
        Es gelten die gesetzlichen Vorschriften über digitale Produkte (§§ 327 ff. BGB). Ein Mangel liegt
        insbesondere vor, wenn Song oder Video nicht abspielbar sind oder der gesungene Text erheblich vom
        freigegebenen Songtext abweicht. Geschmackliche Einschätzungen zu Melodie, Stimme oder Stil, die
        bereits aus der Hörprobe erkennbar waren, begründen keinen Mangel. Bei einem Mangel erstellen wir den
        Song neu oder erstatten den Preis.
      </p>

      <h2>§ 11 Haftung</h2>
      <p>
        melomio haftet unbeschränkt für Vorsatz und grobe Fahrlässigkeit, für Schäden aus der Verletzung des
        Lebens, des Körpers oder der Gesundheit sowie nach dem Produkthaftungsgesetz. Bei leicht fahrlässiger
        Verletzung einer wesentlichen Vertragspflicht (einer Pflicht, deren Erfüllung die ordnungsgemäße
        Durchführung des Vertrags erst ermöglicht und auf deren Einhaltung der Kunde regelmäßig vertrauen
        darf) ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Im Übrigen ist die
        Haftung für leichte Fahrlässigkeit ausgeschlossen.
      </p>

      <h2>§ 12 Kundenkonto</h2>
      <p>
        Der Kunde hält seine Zugangsdaten geheim. Er kann sein Konto jederzeit in den Kontoeinstellungen
        löschen. Gesetzliche Aufbewahrungspflichten (z. B. für Rechnungen) bleiben unberührt. Mit der Löschung
        des Kontos sind Song und Video dort nicht mehr abrufbar.
      </p>

      <h2>§ 13 Datenschutz</h2>
      <p>
        Informationen zur Verarbeitung personenbezogener Daten enthält unsere{" "}
        <Link href="/datenschutz">Datenschutzerklärung</Link>.
      </p>

      <h2>§ 14 Schlussbestimmungen</h2>
      <p>
        Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Bei Verbrauchern
        gilt diese Rechtswahl nur, soweit dadurch nicht der Schutz durch zwingende Bestimmungen des Rechts des
        Staates entzogen wird, in dem der Verbraucher seinen gewöhnlichen Aufenthalt hat. Sollten einzelne
        Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam.
      </p>
    </>
  );
}
