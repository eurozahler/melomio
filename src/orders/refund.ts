import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { auditLogs, invoices, orders, payments, refunds, sharePages } from "@/db/schema";
import { cancelInvoice } from "@/invoices/service";
import type { PaymentProvider } from "@/payments/types";
import type { StorageProvider } from "@/storage";
import { transitionOrder } from "./service";

/**
 * Erstattung (C8, Gewährleistung/Kulanz) – ein Schritt im Admin:
 * 1. Geld beim Zahlungsanbieter zurückbuchen (voller Betrag, ursprüngliches Zahlungsmittel)
 * 2. Stornorechnung zur Rechnung
 * 3. Bestellung → „erstattet“: Downloads und Song-Seite sind danach gesperrt
 */

export class RefundError extends Error {
  constructor(public readonly code: "not_found" | "not_paid" | "wrong_status" | "already_refunded") {
    super(code);
    this.name = "RefundError";
  }
}

const REFUNDABLE = ["paid", "completed", "failed"] as const;

export async function refundOrder(
  db: Database,
  provider: PaymentProvider,
  storage: StorageProvider,
  publicRef: string,
  actorUserId: string,
  reason: string | null,
) {
  const [order] = await db.select().from(orders).where(eq(orders.publicRef, publicRef));
  if (!order) throw new RefundError("not_found");
  if (order.status === "refunded") throw new RefundError("already_refunded");
  if (!order.paidAt) throw new RefundError("not_paid");
  if (!(REFUNDABLE as readonly string[]).includes(order.status)) throw new RefundError("wrong_status");

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.status, "paid")))
    .orderBy(desc(payments.updatedAt))
    .limit(1);
  if (!payment) throw new RefundError("not_paid");
  const [done] = await db.select({ id: refunds.id }).from(refunds).where(eq(refunds.paymentId, payment.id));
  if (done) throw new RefundError("already_refunded");

  const cleanReason = reason?.trim().slice(0, 200) || null;
  // 1. Geld zurück (Netzwerkaufruf – bei Fehler passiert sonst nichts)
  const result = await provider.refund({
    providerPaymentId: payment.providerPaymentId,
    amountCents: payment.amountCents,
    currency: payment.currency,
    description: `Erstattung Bestellung ${order.publicRef}`,
  });
  await db.insert(refunds).values({
    paymentId: payment.id,
    providerRefundId: result.providerRefundId,
    amountCents: payment.amountCents,
    status: result.status,
    reason: cleanReason,
    actor: actorUserId,
  });

  // 2. Stornorechnung (falls eine Rechnung existiert)
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orderId, order.id), eq(invoices.kind, "invoice")));
  const [alreadyCancelled] = invoice
    ? await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.cancelsInvoiceId, invoice.id))
    : [];
  const storno =
    invoice && !alreadyCancelled
      ? await cancelInvoice(db, storage, invoice.id, actorUserId, cleanReason ?? "Erstattung")
      : null;

  // 3. Status und Freigaben
  await transitionOrder(db, order.id, "refunded", {
    actor: actorUserId,
    reason: `Erstattet${cleanReason ? `: ${cleanReason}` : ""}`,
  });
  await db.update(sharePages).set({ active: false }).where(eq(sharePages.orderId, order.id));
  await db.insert(auditLogs).values({
    actorUserId,
    action: "order.refund",
    entity: "order",
    entityId: order.id,
    newValue: { refund: result.providerRefundId, storno: storno?.number ?? null, reason: cleanReason },
  });
  return { providerRefundId: result.providerRefundId, stornoNumber: storno?.number ?? null };
}
