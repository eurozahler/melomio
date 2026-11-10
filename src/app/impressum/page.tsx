import type { Metadata } from "next";
import { Suspense } from "react";
import { Address, companyForLegal, LegalPage } from "@/legal/legal-page";

export const metadata: Metadata = { title: "Impressum – melomio" };

/** Impressum nach § 5 DDG und § 18 Abs. 2 MStV. ⚠️ Entwurf – juristisch prüfen (F-24). */
export default function Page() {
  return (
    <LegalPage title="Impressum">
      <Suspense fallback={<p>…</p>}>
        <Imprint />
      </Suspense>
    </LegalPage>
  );
}

async function Imprint() {
  const c = await companyForLegal();
  return (
    <>
      <h2>Angaben gemäß § 5 DDG</h2>
      <Address c={c} />
      <p>Vertreten durch die Geschäftsführung: {c.managingDirector}</p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href={`mailto:${c.email}`}>{c.email}</a>
        {c.phone && (
          <>
            <br />
            Telefon: {c.phone}
          </>
        )}
      </p>

      {(c.registerCourt || c.registerNumber) && (
        <>
          <h2>Registereintrag</h2>
          <p>
            Registergericht: {c.registerCourt || "[Registergericht]"}
            <br />
            Registernummer: {c.registerNumber || "[Registernummer]"}
          </p>
        </>
      )}

      {c.vatId && (
        <>
          <h2>Umsatzsteuer-ID</h2>
          <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: {c.vatId}</p>
        </>
      )}

      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>
        {c.managingDirector}
        <br />
        Anschrift wie oben
      </p>

      <h2>Verbraucherstreitbeilegung</h2>
      <p>
        Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>

      <h2>Hinweis zu KI-Inhalten</h2>
      <p>
        Songtexte, Musik und Videos auf melomio werden mit Hilfe künstlicher Intelligenz erstellt. Inhalte,
        die Kundinnen und Kunden über die Song-Seiten teilen, stammen aus deren Angaben.
      </p>
    </>
  );
}
