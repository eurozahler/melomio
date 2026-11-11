import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getAffiliateDashboard, getAffiliateForUser } from "@/affiliates/service";
import { Notice } from "@/components/auth-ui";
import { getDb } from "@/db/client";
import { getSetting } from "@/db/settings-store";
import { getSessionUser } from "@/server/session";
import { CodeToggle, NewCode, PartnerForm } from "./partner-ui";

export const metadata: Metadata = { title: "Partnerprogramm – melomio" };

/** Partnerprogramm (Affiliates): Infos, Bewerbung, danach Partnerbereich mit Codes und Provisionen. */
export default function PartnerPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10">
      <Suspense fallback={null}>
        <Partner />
      </Suspense>
    </main>
  );
}

const euro = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const date = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });

async function Partner() {
  const db = getDb();
  const user = await getSessionUser();
  const [discount, commission, holdDays, minPayout] = await Promise.all([
    getSetting(db, "affiliate_discount_pct"),
    getSetting(db, "affiliate_commission_pct"),
    getSetting(db, "affiliate_hold_days"),
    getSetting(db, "affiliate_min_payout_cents"),
  ]);
  const intro = (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold tracking-tight">Partnerprogramm</h1>
      <p className="text-neutral-600 dark:text-neutral-300">
        Empfiehl melomio weiter: Deine Kunden bekommen mit deinem Code Rabatt (derzeit {discount} %), du
        bekommst für jeden verkauften Song eine Provision (derzeit {commission} % vom Nettobetrag). Ausgezahlt
        wird monatlich per Überweisung, {holdDays} Tage nach dem Kauf, ab {euro(minPayout)}.
      </p>
    </div>
  );

  if (!user?.emailVerified) {
    return (
      <div className="flex flex-col gap-6">
        {intro}
        <p>Für die Bewerbung brauchst du ein melomio-Konto.</p>
        <div className="flex gap-3">
          <Link
            href="/anmelden?next=%2Fpartner"
            className="rounded-full bg-brand-strong px-5 py-2.5 font-semibold text-white"
          >
            Anmelden
          </Link>
          <Link
            href="/registrieren"
            className="rounded-full border border-neutral-300 px-5 py-2.5 font-semibold"
          >
            Registrieren
          </Link>
        </div>
      </div>
    );
  }

  const affiliate = await getAffiliateForUser(db, user.id);
  const data = affiliate
    ? {
        fullName: affiliate.fullName,
        company: affiliate.company ?? "",
        street: affiliate.street,
        postalCode: affiliate.postalCode,
        city: affiliate.city,
        channels: affiliate.channels,
        accountHolder: affiliate.accountHolder,
        iban: affiliate.iban,
        taxStatus: affiliate.taxStatus,
        vatId: affiliate.vatId ?? "",
        taxNumber: affiliate.taxNumber ?? "",
      }
    : null;

  if (!affiliate || affiliate.status === "rejected") {
    return (
      <div className="flex flex-col gap-6">
        {intro}
        {affiliate?.status === "rejected" && (
          <Notice kind="info">
            Deine letzte Bewerbung wurde leider abgelehnt. Du kannst dich erneut bewerben.
          </Notice>
        )}
        <section className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="mb-3 text-xl font-bold">Jetzt bewerben</h2>
          <PartnerForm initial={data} mode="apply" />
        </section>
      </div>
    );
  }

  if (affiliate.status === "pending") {
    return (
      <div className="flex flex-col gap-6">
        {intro}
        <Notice kind="info">
          <span data-testid="partner-pending">
            Danke für deine Bewerbung! Wir prüfen sie und melden uns per E-Mail.
          </span>
        </Notice>
      </div>
    );
  }

  if (affiliate.status === "blocked") {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight">Partnerprogramm</h1>
        <Notice kind="error">
          Dein Partnerkonto ist gesperrt. Bei Fragen schreib uns bitte eine E-Mail.
        </Notice>
      </div>
    );
  }

  const dash = await getAffiliateDashboard(db, affiliate.id);
  const myDiscount = affiliate.discountPct ?? discount;
  const myCommission = affiliate.commissionPct ?? commission;
  return (
    <div className="flex flex-col gap-8" data-testid="partner-dashboard">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dein Partnerbereich</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-300">
          Kundenrabatt: <strong>{myDiscount} %</strong> · Deine Provision: <strong>{myCommission} %</strong>{" "}
          vom Nettobetrag
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Provisionen">
        {(
          [
            ["Wartezeit", dash.totals.waiting],
            ["Fällig", dash.totals.due],
            ["In Auszahlung", dash.totals.inPayout],
            ["Ausgezahlt", dash.totals.paid],
          ] as const
        ).map(([label, cents]) => (
          <div key={label} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="text-lg font-bold">{euro(cents)}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Deine Codes</h2>
        <ul className="flex flex-col gap-2" data-testid="partner-codes">
          {dash.codes.map(({ code, uses }) => (
            <li
              key={code.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <span>
                <strong className="font-mono text-lg">{code.code}</strong>
                <span className="ml-2 text-sm text-neutral-500">
                  {uses} Verkäufe{code.active ? "" : " · deaktiviert"}
                </span>
              </span>
              <CodeToggle codeId={code.id} active={code.active} />
            </li>
          ))}
          {dash.codes.length === 0 && <li className="text-sm text-neutral-500">Noch keine Codes.</li>}
        </ul>
        <NewCode />
      </section>

      <section>
        <h2 className="mb-2 text-xl font-bold">Provisionen</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-neutral-500">
              <tr>
                <th className="py-1 pr-3">Datum</th>
                <th className="py-1 pr-3">Bestellung</th>
                <th className="py-1 pr-3">Code</th>
                <th className="py-1 pr-3">Provision</th>
                <th className="py-1">Stand</th>
              </tr>
            </thead>
            <tbody>
              {dash.commissions.map(({ c, ref, code }) => (
                <tr key={c.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-1 pr-3">{date(c.createdAt)}</td>
                  <td className="py-1 pr-3">
                    {ref}
                    {c.isTest && " (Test)"}
                  </td>
                  <td className="py-1 pr-3">{code}</td>
                  <td className="py-1 pr-3">{euro(c.commissionCents)}</td>
                  <td className="py-1">
                    {c.status === "canceled"
                      ? "storniert (Erstattung)"
                      : c.status === "paid"
                        ? "ausgezahlt"
                        : c.payoutId
                          ? "in Auszahlung"
                          : c.payableAt <= new Date()
                            ? "fällig"
                            : `fällig ab ${date(c.payableAt)}`}
                  </td>
                </tr>
              ))}
              {dash.commissions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-2 text-neutral-500">
                    Noch keine Verkäufe.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {dash.payouts.length > 0 && (
        <section className="flex flex-col gap-1 text-sm">
          <h2 className="mb-1 text-xl font-bold">Gutschriften</h2>
          {dash.payouts.map((p) => (
            <a
              key={p.id}
              href={`/api/partner/gutschrift/${p.number}`}
              target="_blank"
              rel="noreferrer"
              className="text-brand underline"
            >
              {p.number} · {euro(p.grossCents)} ·{" "}
              {p.paidAt ? `überwiesen am ${date(p.paidAt)}` : "Überweisung folgt"}
            </a>
          ))}
        </section>
      )}

      <details className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
        <summary className="cursor-pointer font-semibold">Meine Daten (Adresse, Bank, Steuer) ändern</summary>
        <div className="mt-4">
          <PartnerForm initial={data} mode="update" />
        </div>
      </details>
    </div>
  );
}
