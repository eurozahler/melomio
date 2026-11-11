import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import { getCompanyProfile, type CompanyProfile } from "@/invoices/company";

/**
 * Rechtstexte (Impressum, AGB, Datenschutz, Widerruf) – ENTWÜRFE nach gängigen Mustern,
 * vor dem Livegang juristisch prüfen lassen (F-24). Die Firmendaten kommen aus dem Admin
 * („Firma“), damit sie an einer Stelle gepflegt werden.
 */

export const LEGAL_VERSION = "2026-11-11-entwurf";

/** Firmendaten mit sichtbaren Platzhaltern, solange im Admin noch nichts eingetragen ist. */
export async function companyForLegal(): Promise<CompanyProfile & { complete: boolean }> {
  const { profile, complete } = await getCompanyProfile(getDb());
  const or = (v: string, label: string) => v || `[${label} – im Admin unter „Firma“ eintragen]`;
  return {
    ...profile,
    complete,
    name: or(profile.name, "Firmenname"),
    street: or(profile.street, "Straße"),
    postalCode: profile.postalCode || "[PLZ]",
    city: or(profile.city, "Ort"),
    managingDirector: or(profile.managingDirector, "Geschäftsführer/in"),
    email: or(profile.email, "E-Mail"),
  };
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p
        className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        data-testid="legal-draft"
      >
        Entwurf (Stand {LEGAL_VERSION.slice(0, 10).split("-").reverse().join(".")}) – wird vor dem Livegang
        juristisch geprüft.
      </p>
      <div className="legal mt-6 flex flex-col gap-4 leading-relaxed [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_a]:text-brand [&_a]:underline">
        {children}
      </div>
    </main>
  );
}

export function Address({ c }: { c: CompanyProfile }) {
  return (
    <p>
      {c.name}
      <br />
      {c.street}
      <br />
      {c.postalCode} {c.city}
      {c.country && c.country !== "Deutschland" && (
        <>
          <br />
          {c.country}
        </>
      )}
    </p>
  );
}
