import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  auditLogs,
  invoiceCounters,
  invoices,
  orders,
  payments,
  priceSnapshots,
  users,
  type InvoiceLine,
} from "@/db/schema";
import { invoiceBuyer } from "@/orders/billing";
import { splitGross } from "@/payments/types";
import type { StorageProvider } from "@/storage";
import { CompanyProfileError, getCompanyProfile, TEST_SELLER, toSeller } from "./company";
import { formatDate, renderInvoicePdf } from "./pdf";

/**
 * Rechnungen ausstellen (nach bestätigter Zahlung, automatisch) und stornieren.
 * - Nummer, Datensatz und PDF entstehen in EINER Transaktion: Schlägt etwas fehl, wird auch die
 *   Nummer nicht verbraucht → lückenlose Nummernkreise.
 * - Testbestellungen bekommen einen eigenen Nummernkreis (TEST-RE-…) und den Vermerk „Testrechnung“.
 */

export type Invoice = typeof invoices.$inferSelect;

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function nextNumber(tx: Tx, series: "RE" | "ST", isTest: boolean, year: number): Promise<string> {
  const key = `${isTest ? "TEST-" : ""}${series}`;
  const [row] = await tx
    .insert(invoiceCounters)
    .values({ series: key, year, last: 1 })
    .onConflictDoUpdate({
      target: [invoiceCounters.series, invoiceCounters.year],
      set: { last: sql`${invoiceCounters.last} + 1` },
    })
    .returning({ last: invoiceCounters.last });
  return `${key}-${year}-${String(row!.last).padStart(5, "0")}`;
}

function berlinYear(d: Date) {
  return Number(new Intl.DateTimeFormat("de-DE", { year: "numeric", timeZone: "Europe/Berlin" }).format(d));
}

async function storePdf(storage: StorageProvider, key: string, bytes: Uint8Array) {
  const dir = await mkdtemp(path.join(tmpdir(), "melomio-invoice-"));
  try {
    const file = path.join(dir, `${randomUUID()}.pdf`);
    await writeFile(file, bytes);
    await storage.putFile(key, file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function storageKeyFor(number: string, issuedAt: Date) {
  return `invoices/${berlinYear(issuedAt)}/${number}.pdf`;
}

/** Rechnung zur bezahlten Bestellung – höchstens eine; bei Wiederholung wird die vorhandene geliefert. */
export async function createInvoiceForOrder(
  db: Database,
  storage: StorageProvider,
  orderId: string,
): Promise<Invoice> {
  const [existing] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orderId, orderId), eq(invoices.kind, "invoice")));
  if (existing) return existing;

  const [row] = await db
    .select({ order: orders, user: users, snapshot: priceSnapshots })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .leftJoin(priceSnapshots, eq(priceSnapshots.orderId, orders.id))
    .where(eq(orders.id, orderId));
  if (!row) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  const { order, user, snapshot } = row;
  if (!order.paidAt) throw new Error(`Bestellung ${order.publicRef} ist nicht bezahlt – keine Rechnung`);
  if (!snapshot) throw new Error(`Bestellung ${order.publicRef}: Preis fehlt – keine Rechnung`);

  const company = await getCompanyProfile(db);
  if (!company.complete && !order.isTest)
    throw new CompanyProfileError(["Firmendaten unvollständig – im Admin unter „Firma“ ergänzen"]);
  const seller = company.complete ? toSeller(company.profile) : TEST_SELLER;

  const [payment] = await db
    .select({ provider: payments.provider })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.status, "paid")))
    .orderBy(desc(payments.updatedAt))
    .limit(1);
  const via =
    payment?.provider === "mollie"
      ? " über Mollie"
      : payment?.provider === "voucher"
        ? " (vollständig mit Gutschein)"
        : payment
          ? " (Testzahlung)"
          : "";

  // Positionen aus dem eingefrorenen Preis (Song, ggf. Gutschein). Netto/Steuer je Position;
  // Rundungsdifferenzen landen in der letzten Position, damit die Summen exakt stimmen.
  const items = snapshot.items.length
    ? snapshot.items
    : [
        {
          productSlug: "song",
          name: "Persönlicher Song mit Video",
          quantity: 1,
          unitGrossCents: snapshot.grossCents,
        },
      ];
  let restNet = snapshot.netCents;
  let restTax = snapshot.taxCents;
  const lines: InvoiceLine[] = items.map((item, i) => {
    const gross = item.unitGrossCents * item.quantity;
    const last = i === items.length - 1;
    const split = splitGross(gross, snapshot.taxRateBp);
    const netCents = last ? restNet : split.netCents;
    const taxCents = last ? restTax : split.taxCents;
    restNet -= netCents;
    restTax -= taxCents;
    const description =
      item.productSlug === "voucher"
        ? item.name
        : `${item.name} (digitaler Inhalt, Bestellung ${order.publicRef})`;
    return {
      description,
      quantity: item.quantity,
      netCents,
      taxCents,
      grossCents: netCents + taxCents,
      taxRateBp: snapshot.taxRateBp,
    };
  });

  return db.transaction(async (tx) => {
    // Gleichzeitige Versuche für dieselbe Bestellung nacheinander
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`melomio:invoice:${orderId}`}))`);
    const [again] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.orderId, orderId), eq(invoices.kind, "invoice")));
    if (again) return again;

    const issuedAt = new Date();
    const number = await nextNumber(tx, "RE", order.isTest, berlinYear(issuedAt));
    const storageKey = storageKeyFor(number, issuedAt);
    const buyer = invoiceBuyer(order.billing ?? null, user);
    const paymentNote = `Bezahlt am ${formatDate(order.paidAt!)}${via}. Es ist kein Betrag offen.`;
    const pdf = await renderInvoicePdf({
      kind: "invoice",
      number,
      issuedAt,
      serviceDate: order.paidAt!,
      orderRef: order.publicRef,
      seller,
      buyer,
      lines,
      netCents: snapshot.netCents,
      taxCents: snapshot.taxCents,
      grossCents: snapshot.grossCents,
      currency: snapshot.currency,
      paymentNote,
      isTest: order.isTest,
    });
    await storePdf(storage, storageKey, pdf);
    const [invoice] = await tx
      .insert(invoices)
      .values({
        number,
        kind: "invoice",
        orderId,
        userId: user.id,
        isTest: order.isTest,
        issuedAt,
        serviceDate: order.paidAt!,
        seller,
        buyer,
        lines,
        netCents: snapshot.netCents,
        taxCents: snapshot.taxCents,
        grossCents: snapshot.grossCents,
        currency: snapshot.currency,
        paymentNote,
        storageKey,
      })
      .returning();
    return invoice!;
  });
}

export class InvoiceActionError extends Error {
  constructor(public readonly code: "not_found" | "already_cancelled" | "not_cancellable") {
    super(code);
    this.name = "InvoiceActionError";
  }
}

/** Stornorechnung (negative Beträge) zu einer Rechnung. Die Rückzahlung selbst läuft über Mollie. */
export async function cancelInvoice(
  db: Database,
  storage: StorageProvider,
  invoiceId: string,
  actorUserId: string,
  reason: string | null,
): Promise<Invoice> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`melomio:invoice-cancel:${invoiceId}`}))`);
    const [original] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!original) throw new InvoiceActionError("not_found");
    if (original.kind !== "invoice") throw new InvoiceActionError("not_cancellable");
    const [done] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.cancelsInvoiceId, invoiceId));
    if (done) throw new InvoiceActionError("already_cancelled");
    const [order] = await tx
      .select({ publicRef: orders.publicRef })
      .from(orders)
      .where(eq(orders.id, original.orderId));

    const issuedAt = new Date();
    const number = await nextNumber(tx, "ST", original.isTest, berlinYear(issuedAt));
    const storageKey = storageKeyFor(number, issuedAt);
    const neg = (n: number) => -n;
    const lines = original.lines.map((l) => ({
      ...l,
      netCents: neg(l.netCents),
      taxCents: neg(l.taxCents),
      grossCents: neg(l.grossCents),
    }));
    const cleanReason = reason?.trim().slice(0, 200) || null;
    const pdf = await renderInvoicePdf({
      kind: "cancellation",
      number,
      cancelsNumber: original.number,
      issuedAt,
      serviceDate: original.serviceDate,
      orderRef: order?.publicRef ?? "—",
      seller: original.seller,
      buyer: original.buyer,
      lines,
      netCents: neg(original.netCents),
      taxCents: neg(original.taxCents),
      grossCents: neg(original.grossCents),
      currency: original.currency,
      paymentNote: "Der Betrag wird auf das ursprüngliche Zahlungsmittel erstattet.",
      reason: cleanReason,
      isTest: original.isTest,
    });
    await storePdf(storage, storageKey, pdf);
    const [cancellation] = await tx
      .insert(invoices)
      .values({
        number,
        kind: "cancellation",
        orderId: original.orderId,
        userId: original.userId,
        cancelsInvoiceId: original.id,
        isTest: original.isTest,
        issuedAt,
        serviceDate: original.serviceDate,
        seller: original.seller,
        buyer: original.buyer,
        lines,
        netCents: neg(original.netCents),
        taxCents: neg(original.taxCents),
        grossCents: neg(original.grossCents),
        currency: original.currency,
        paymentNote: null,
        reason: cleanReason,
        storageKey,
      })
      .returning();
    await tx.insert(auditLogs).values({
      actorUserId,
      action: "invoice.cancel",
      entity: "invoice",
      entityId: original.id,
      oldValue: { number: original.number },
      newValue: { number, reason: cleanReason },
    });
    return cancellation!;
  });
}

export async function listInvoicesForOrder(db: Database, orderId: string): Promise<Invoice[]> {
  return db.select().from(invoices).where(eq(invoices.orderId, orderId)).orderBy(invoices.issuedAt);
}

/** Liest die PDF-Datei einer Rechnung (z. B. als E-Mail-Anhang). */
export async function readInvoicePdf(
  storage: StorageProvider,
  invoice: Pick<Invoice, "storageKey">,
): Promise<Buffer> {
  const file = await storage.open(invoice.storageKey);
  if (!file) throw new Error(`Rechnungsdatei fehlt: ${invoice.storageKey}`);
  return Buffer.from(await new Response(file.stream).arrayBuffer());
}
