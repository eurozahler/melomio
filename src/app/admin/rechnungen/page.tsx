import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { invoices, orders } from "@/db/schema";
import { formatMoney } from "@/invoices/pdf";
import { requireAdmin } from "@/server/admin";
import { cancelInvoiceAction } from "../actions";
import { StornoButton } from "./storno-button";

export default function AdminInvoices() {
  return (
    <Suspense fallback={null}>
      <Invoices />
    </Suspense>
  );
}

async function Invoices() {
  await requireAdmin("/admin/rechnungen");
  const db = getDb();
  const rows = await db
    .select({ invoice: invoices, ref: orders.publicRef })
    .from(invoices)
    .innerJoin(orders, eq(orders.id, invoices.orderId))
    .orderBy(desc(invoices.issuedAt))
    .limit(200);
  const cancelled = new Set(
    rows.flatMap((r) => (r.invoice.cancelsInvoiceId ? [r.invoice.cancelsInvoiceId] : [])),
  );
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const day = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
  const exportLink =
    "rounded-full border border-neutral-300 px-3 py-1.5 text-sm font-semibold dark:border-neutral-700";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Rechnungen</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Rechnungen entstehen automatisch nach der Zahlung und werden nie gelöscht oder geändert. Korrekturen
          nur über „Stornieren“.
        </p>
      </div>

      <section className="flex flex-wrap gap-2" aria-label="Export für den Steuerberater">
        <a className={exportLink} href={`/api/admin/rechnungen-export?jahr=${prev.y}&monat=${prev.m}`}>
          CSV Vormonat
        </a>
        <a className={exportLink} href={`/api/admin/rechnungen-export?jahr=${year}&monat=${month}`}>
          CSV dieser Monat
        </a>
        <a className={exportLink} href={`/api/admin/rechnungen-export?jahr=${year}`}>
          CSV Jahr {year}
        </a>
        <a className={exportLink} href={`/api/admin/rechnungen-export?jahr=${year}&test=1`}>
          CSV Testrechnungen
        </a>
      </section>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Noch keine Rechnungen.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="invoice-table">
            <thead className="text-xs text-neutral-500 uppercase">
              <tr>
                <th className="py-2 pr-3">Nummer</th>
                <th className="py-2 pr-3">Datum</th>
                <th className="py-2 pr-3">Bestellung</th>
                <th className="py-2 pr-3">Kunde</th>
                <th className="py-2 pr-3 text-right">Brutto</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ invoice: i, ref }) => (
                <tr key={i.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-2 pr-3 font-semibold">
                    <a
                      href={`/api/admin/rechnung/${i.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand"
                    >
                      {i.number}
                    </a>
                    {i.kind === "cancellation" && <span className="ml-2 text-xs text-red-700">Storno</span>}
                    {i.isTest && <span className="ml-2 text-xs text-amber-700">TEST</span>}
                  </td>
                  <td className="py-2 pr-3">{day(i.issuedAt)}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/admin/bestellungen/${ref}`} className="underline">
                      {ref}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{i.buyer.email ?? i.buyer.name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatMoney(i.grossCents, i.currency)}
                  </td>
                  <td className="py-2 pr-3">
                    {i.kind === "invoice" &&
                      (cancelled.has(i.id) ? (
                        <span className="text-xs text-neutral-500">storniert</span>
                      ) : (
                        <StornoButton number={i.number} cancel={cancelInvoiceAction.bind(null, i.id)} />
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
