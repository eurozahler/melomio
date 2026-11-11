import { Suspense } from "react";
import { listAffiliates, listPayouts, maskIban } from "@/affiliates/service";
import { getDb } from "@/db/client";
import { getSetting } from "@/db/settings-store";
import { requireAdmin } from "@/server/admin";
import { ActionButton, ReasonButton } from "../admin-ui";
import { RatesForm } from "./rates-form";
import { createPayoutAction, decideAffiliateAction, markPayoutPaidAction } from "./actions";

const STATUS = {
  pending: "Bewerbung offen",
  active: "Aktiv",
  rejected: "Abgelehnt",
  blocked: "Gesperrt",
} as const;
const TAX = {
  private: "Privatperson",
  small_business: "Kleinunternehmer",
  vat_registered: "mit USt.",
} as const;

export default function AdminAffiliates() {
  return (
    <Suspense fallback={null}>
      <Affiliates />
    </Suspense>
  );
}

const euro = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const date = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });

async function Affiliates() {
  await requireAdmin("/admin/affiliates");
  const db = getDb();
  const [rows, payouts, defDiscount, defCommission, minPayout] = await Promise.all([
    listAffiliates(db),
    listPayouts(db),
    getSetting(db, "affiliate_discount_pct"),
    getSetting(db, "affiliate_commission_pct"),
    getSetting(db, "affiliate_min_payout_cents"),
  ]);
  const order = { pending: 0, active: 1, blocked: 2, rejected: 3 } as const;
  rows.sort((a, b) => order[a.a.status] - order[b.a.status]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Affiliates</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Standard: {defDiscount} % Kundenrabatt, {defCommission} % Provision vom Netto (änderbar unter
          Einstellungen). Auszahlung ab {euro(minPayout)}. Partner bewerben sich unter /partner.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        {rows.length === 0 && <p className="text-sm text-neutral-500">Noch keine Bewerbungen.</p>}
        {rows.map(({ a, email, sales, due }) => (
          <article
            key={a.id}
            className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800"
            data-testid="affiliate-row"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-base">
                <strong>{a.fullName}</strong>
                {a.company && ` · ${a.company}`} · {email}
              </p>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold dark:bg-neutral-800">
                {STATUS[a.status]}
              </span>
            </div>
            <p className="text-neutral-600 dark:text-neutral-300">
              {a.street}, {a.postalCode} {a.city} · {TAX[a.taxStatus]}
              {a.vatId && ` · USt-IdNr. ${a.vatId}`}
              {a.taxNumber && ` · St.-Nr. ${a.taxNumber}`} · {a.accountHolder}, {maskIban(a.iban)}
            </p>
            <p>
              <span className="text-neutral-500">Kanäle:</span> {a.channels}
            </p>
            <p>
              Verkäufe: {sales} · beworben am {date(a.createdAt)}
            </p>
            <div className="flex flex-wrap gap-2">
              {a.status === "pending" && (
                <>
                  <ActionButton
                    label="Freischalten"
                    action={decideAffiliateAction.bind(null, a.id, "active", null)}
                  />
                  <ReasonButton
                    label="Ablehnen"
                    question={`Bewerbung von ${a.fullName} ablehnen?`}
                    action={decideAffiliateAction.bind(null, a.id, "rejected")}
                  />
                </>
              )}
              {a.status === "active" && (
                <ReasonButton
                  label="Sperren"
                  question={`${a.fullName} sperren? Die Codes funktionieren dann sofort nicht mehr.`}
                  action={decideAffiliateAction.bind(null, a.id, "blocked")}
                />
              )}
              {a.status === "blocked" && (
                <ActionButton
                  label="Entsperren"
                  variant="secondary"
                  action={decideAffiliateAction.bind(null, a.id, "active", null)}
                />
              )}
            </div>
            {a.status === "active" && (
              <RatesForm
                id={a.id}
                discount={a.discountPct === null ? "" : String(a.discountPct)}
                commission={a.commissionPct === null ? "" : String(a.commissionPct)}
                defaults={{ discount: defDiscount, commission: defCommission }}
              />
            )}
            {due.map((d) => (
              <div
                key={String(d.isTest)}
                className="flex flex-wrap items-center gap-3 rounded-lg bg-neutral-50 p-2 dark:bg-neutral-900"
              >
                <span>
                  Fällig{d.isTest ? " (Test)" : ""}: <strong>{euro(d.cents)}</strong> aus {d.n} Bestellung
                  {d.n === 1 ? "" : "en"}
                  {d.cents < minPayout && " – unter dem Mindestbetrag"}
                </span>
                <ActionButton
                  label="Gutschrift erstellen"
                  confirmText={`Gutschrift über ${euro(d.cents)} (netto) für ${a.fullName} erstellen? Die Nummer wird fest vergeben.`}
                  action={createPayoutAction.bind(null, a.id, d.isTest)}
                />
              </div>
            ))}
          </article>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-xl font-bold">Auszahlungen</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-neutral-500">
              <tr>
                <th className="py-1 pr-3">Nr.</th>
                <th className="py-1 pr-3">Partner</th>
                <th className="py-1 pr-3">Betrag</th>
                <th className="py-1 pr-3">Konto</th>
                <th className="py-1">Überwiesen</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map(({ p, name }) => (
                <tr key={p.id} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                  <td className="py-1 pr-3">
                    <a
                      href={`/api/admin/gutschrift/${p.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand underline"
                    >
                      {p.number}
                    </a>
                  </td>
                  <td className="py-1 pr-3">{name}</td>
                  <td className="py-1 pr-3">{euro(p.grossCents)}</td>
                  <td className="py-1 pr-3 font-mono text-xs">
                    {p.accountHolder}
                    <br />
                    {p.iban}
                  </td>
                  <td className="py-1">
                    {p.paidAt ? (
                      date(p.paidAt)
                    ) : (
                      <ActionButton
                        label="Als überwiesen markieren"
                        variant="secondary"
                        action={markPayoutPaidAction.bind(null, p.id)}
                      />
                    )}
                  </td>
                </tr>
              ))}
              {payouts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-2 text-neutral-500">
                    Noch keine Auszahlungen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
