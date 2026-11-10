import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { invoices, orders } from "@/db/schema";
import { getAdminUser } from "@/server/admin";

/**
 * Rechnungsliste als CSV für den Steuerberater (Excel-tauglich: Semikolon, Komma als Dezimalzeichen).
 * ?jahr=2026&monat=11 (Monat optional) · ?test=1 für Testrechnungen.
 */
export async function GET(request: Request) {
  if (!(await getAdminUser())) return new Response("Nicht gefunden", { status: 404 });
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("jahr")) || new Date().getFullYear();
  const month = Number(url.searchParams.get("monat")) || null;
  const isTest = url.searchParams.get("test") === "1";

  const rows = await getDb()
    .select({ invoice: invoices, ref: orders.publicRef })
    .from(invoices)
    .innerJoin(orders, eq(orders.id, invoices.orderId))
    .where(
      and(
        eq(invoices.isTest, isTest),
        sql`extract(year from ${invoices.issuedAt} at time zone 'Europe/Berlin') = ${year}`,
        month
          ? sql`extract(month from ${invoices.issuedAt} at time zone 'Europe/Berlin') = ${month}`
          : undefined,
      ),
    )
    .orderBy(asc(invoices.issuedAt));

  const cancelledIds = rows.flatMap((r) => (r.invoice.cancelsInvoiceId ? [r.invoice.cancelsInvoiceId] : []));
  const originals = cancelledIds.length
    ? await getDb()
        .select({ id: invoices.id, number: invoices.number })
        .from(invoices)
        .where(inArray(invoices.id, cancelledIds))
    : [];
  const de = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const day = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
  const cell = (s: string) => `"${s.replaceAll('"', '""')}"`;
  const lines = [
    [
      "Rechnungsnummer",
      "Art",
      "Datum",
      "Leistungsdatum",
      "Bestellnummer",
      "Kunde",
      "Netto",
      "USt-Satz",
      "USt",
      "Brutto",
      "Waehrung",
      "Storniert Rechnung",
    ].join(";"),
    ...rows.map(({ invoice: i, ref }) =>
      [
        i.number,
        i.kind === "cancellation" ? "Storno" : "Rechnung",
        day(i.issuedAt),
        day(i.serviceDate),
        ref,
        cell(i.buyer.email ?? i.buyer.name),
        de(i.netCents),
        `${(i.lines[0]?.taxRateBp ?? 0) / 100}%`,
        de(i.taxCents),
        de(i.grossCents),
        i.currency,
        originals.find((o) => o.id === i.cancelsInvoiceId)?.number ?? "",
      ].join(";"),
    ),
  ];
  const name = `rechnungen-${year}${month ? `-${String(month).padStart(2, "0")}` : ""}${isTest ? "-test" : ""}.csv`;
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
