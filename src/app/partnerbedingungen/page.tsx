import type { Metadata } from "next";
import { Suspense } from "react";
import { Address, companyForLegal, LegalPage } from "@/legal/legal-page";

export const metadata: Metadata = { title: "Partnerbedingungen – melomio" };

/** Bedingungen des Affiliate-Programms. ⚠️ Entwurf – juristisch und steuerlich prüfen. */
export default function Page() {
  return (
    <LegalPage title="Partnerbedingungen (Affiliate-Programm)">
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
      <h2>§ 1 Vertragspartner</h2>
      <p>Diese Bedingungen gelten für die Teilnahme am Partnerprogramm von melomio. Anbieter ist:</p>
      <Address c={c} />

      <h2>§ 2 Teilnahme</h2>
      <p>
        Teilnehmen kann, wer ein melomio-Konto hat, volljährig ist und seine Kontakt-, Bank- und Steuerdaten
        vollständig angibt. Ein Anspruch auf Aufnahme besteht nicht; melomio prüft jede Bewerbung und kann sie
        ohne Angabe von Gründen ablehnen.
      </p>

      <h2>§ 3 Codes, Rabatt und Provision</h2>
      <p>
        Freigeschaltete Partner können Rabattcodes erzeugen. Kunden erhalten mit einem Code den im
        Partnerbereich angezeigten Rabatt. Für jede damit bezahlte Bestellung erhält der Partner die
        angezeigte Provision in Prozent vom Nettobetrag der Bestellung (nach Rabatten, ohne Umsatzsteuer). Pro
        Bestellung gilt nur ein Code; Käufe mit dem eigenen Code sind ausgeschlossen. melomio kann Rabatt und
        Provision mit Wirkung für künftige Bestellungen ändern.
      </p>

      <h2>§ 4 Fälligkeit und Auszahlung</h2>
      <p>
        Eine Provision wird 30 Tage nach dem Kauf fällig. Wird eine Bestellung erstattet, entfällt die
        Provision; bereits ausgezahlte Provisionen werden mit künftigen Auszahlungen verrechnet. Fällige
        Provisionen werden monatlich ab einem Mindestbetrag per Überweisung ausgezahlt. Über jede Auszahlung
        erstellt melomio eine Gutschrift bzw. Provisionsabrechnung, die im Partnerbereich abrufbar ist.
      </p>

      <h2>§ 5 Steuern</h2>
      <p>
        Der Partner ist für die Versteuerung seiner Provisionen selbst verantwortlich und hält seine
        steuerlichen Angaben aktuell. Bei umsatzsteuerpflichtigen Partnern weist die Gutschrift Umsatzsteuer
        aus; bei Kleinunternehmern (§ 19 UStG) und Privatpersonen nicht. Der Partner kann einer Gutschrift
        innerhalb von 14 Tagen widersprechen.
      </p>

      <h2>§ 6 Werbung</h2>
      <p>
        Der Partner wirbt wahrheitsgemäß und kennzeichnet Werbung als solche (z. B. „Anzeige“ oder „Werbung“).
        Nicht erlaubt sind insbesondere Spam, irreführende Aussagen, das Bieten auf die Marke „melomio“ in
        Suchmaschinen und die Veröffentlichung von Codes auf Gutschein-Portalen ohne Zustimmung. Bei Verstößen
        kann melomio den Partner sperren; Provisionen aus unzulässiger Werbung entfallen.
      </p>

      <h2>§ 7 Laufzeit und Kündigung</h2>
      <p>
        Die Teilnahme kann von beiden Seiten jederzeit beendet werden. Bis dahin entstandene, nicht erstattete
        Provisionen werden nach § 4 ausgezahlt.
      </p>

      <h2>§ 8 Datenschutz</h2>
      <p>
        melomio verarbeitet die Angaben des Partners zur Durchführung des Partnerprogramms (Art. 6 Abs. 1 lit.
        b DSGVO) und bewahrt Gutschriften nach den gesetzlichen Fristen auf. Der Partner erhält keine
        personenbezogenen Daten der Kunden, nur Bestellnummern und Beträge.
      </p>
    </>
  );
}
