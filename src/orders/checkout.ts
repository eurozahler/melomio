import { and, count, desc, eq, inArray, lte } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Database } from "@/db/client";
import {
  consents,
  orderItems,
  orders,
  paymentEvents,
  payments,
  priceSnapshots,
  prices,
  products,
  taxRates,
} from "@/db/schema";
import { CONSENT_TEXTS } from "@/domain/consents";
import { enqueue } from "@/jobs/enqueue";
import { QUEUES } from "@/jobs/queues";
import { FAILED_PAYMENT_STATUSES, splitGross, type PaymentProvider } from "@/payments/types";
import { transitionOrder } from "./service";

/**
 * Checkout und Zahlung (Modul M7, docs/ARCHITEKTUR.md Abschnitt 8):
 * - Kauf nur mit beiden Pflicht-Haken (nicht vorangekreuzt): AGB/Datenschutz und Widerrufsverzicht
 * - Preis wird beim ersten Checkout eingefroren (unveränderlicher Preis-Snapshot)
 * - Eine Bestellung gilt NUR als bezahlt, wenn der Server den Status selbst beim Anbieter abgefragt hat
 * - Jede Benachrichtigung wird protokolliert; doppelte Benachrichtigungen bewirken nichts
 */

export type CheckoutErrorCode = "not_found" | "wrong_status" | "consents_required" | "no_price";

export class CheckoutError extends Error {
  constructor(public readonly code: CheckoutErrorCode) {
    super(`Checkout abgelehnt: ${code}`);
    this.name = "CheckoutError";
  }
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Preis-Snapshot der Bestellung – beim ersten Checkout aus dem aktuellen Preis erzeugt. */
async function ensurePriceSnapshot(tx: Tx, orderId: string) {
  const [existing] = await tx.select().from(priceSnapshots).where(eq(priceSnapshots.orderId, orderId));
  if (existing) return existing;
  // Aktuell gültiger Preis des Songs (neuester mit validFrom ≤ jetzt)
  const [row] = await tx
    .select({ price: prices, product: products, tax: taxRates })
    .from(prices)
    .innerJoin(products, eq(prices.productId, products.id))
    .innerJoin(taxRates, eq(prices.taxRateId, taxRates.id))
    .where(and(eq(products.slug, "song"), eq(products.active, true), lte(prices.validFrom, new Date())))
    .orderBy(desc(prices.validFrom))
    .limit(1);
  if (!row) throw new CheckoutError("no_price");
  const { price, product, tax } = row;
  const { netCents, taxCents } = splitGross(price.grossCents, tax.rateBp);
  await tx
    .insert(orderItems)
    .values({ orderId, productId: product.id, quantity: 1, unitGrossCents: price.grossCents });
  const [snapshot] = await tx
    .insert(priceSnapshots)
    .values({
      orderId,
      items: [
        { productSlug: product.slug, name: product.name.de, quantity: 1, unitGrossCents: price.grossCents },
      ],
      netCents,
      taxCents,
      grossCents: price.grossCents,
      taxRateBp: tax.rateBp,
      currency: price.currency,
    })
    .returning();
  if (!snapshot) throw new CheckoutError("no_price");
  return snapshot;
}

export type StartCheckoutInput = {
  publicRef: string;
  userId: string;
  accepted: { termsPrivacy: boolean; withdrawalWaiver: boolean };
  ipHash: string | null;
  baseUrl: string;
  webhookUrl: string | null;
};

/** Startet (oder setzt fort) die Zahlung und liefert die Adresse der Bezahlseite. */
export async function startCheckout(db: Database, provider: PaymentProvider, input: StartCheckoutInput) {
  if (input.accepted.termsPrivacy !== true || input.accepted.withdrawalWaiver !== true) {
    throw new CheckoutError("consents_required");
  }
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.publicRef, input.publicRef), eq(orders.userId, input.userId)));
  if (!order) throw new CheckoutError("not_found");

  // Läuft schon eine offene Zahlung? Dann dieselbe Bezahlseite wieder öffnen (keine zweite Zahlung)
  if (order.status === "awaiting_payment") {
    const [open] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, order.id), inArray(payments.status, ["open", "pending", "authorized"])))
      .orderBy(desc(payments.createdAt))
      .limit(1);
    if (open?.checkoutUrl) return open.checkoutUrl;
  }
  if (order.status !== "preview_ready" && order.status !== "awaiting_payment") {
    throw new CheckoutError("wrong_status");
  }

  // Preis einfrieren und Einwilligungen festhalten
  const snapshot = await db.transaction(async (tx) => {
    const snap = await ensurePriceSnapshot(tx, order.id);
    await tx.insert(consents).values(
      (["terms_privacy", "withdrawal_waiver"] as const).map((type) => ({
        userId: input.userId,
        orderId: order.id,
        type,
        textVersion: CONSENT_TEXTS[type].version,
        ipHash: input.ipHash,
      })),
    );
    return snap;
  });

  // Zahlung beim Anbieter anlegen (Netzwerkaufruf außerhalb der Transaktion)
  const [attempts] = await db.select({ n: count() }).from(payments).where(eq(payments.orderId, order.id));
  const created = await provider.createPayment({
    amountCents: snapshot.grossCents,
    currency: snapshot.currency,
    description: `melomio Song ${order.publicRef}`,
    redirectUrl: `${input.baseUrl}/bestellung/${order.publicRef}?zahlung=zurueck`,
    webhookUrl: input.webhookUrl,
    metadata: { orderId: order.id, publicRef: order.publicRef },
    idempotencyKey: `${order.id}:${(attempts?.n ?? 0) + 1}`,
  });

  await db.transaction(async (tx) => {
    await tx
      .insert(payments)
      .values({
        orderId: order.id,
        provider: provider.name,
        providerPaymentId: created.providerPaymentId,
        status: created.status,
        amountCents: snapshot.grossCents,
        currency: snapshot.currency,
        mode: provider.mode,
        checkoutUrl: created.checkoutUrl,
      })
      .onConflictDoNothing();
    const [locked] = await tx.select().from(orders).where(eq(orders.id, order.id)).for("update");
    if (locked?.status === "preview_ready") {
      await transitionOrder(tx, order.id, "awaiting_payment", {
        actor: input.userId,
        reason: "Checkout gestartet",
      });
    }
  });
  return created.checkoutUrl;
}

export type PaymentUpdateResult =
  { outcome: "paid" | "failed" | "unchanged" } | { outcome: "ignored"; reason: string };

/**
 * Verarbeitet eine Zahlungs-Benachrichtigung (Webhook) oder eine Rückkehr von der Bezahlseite.
 * Der Status kommt IMMER aus der eigenen Abfrage beim Anbieter – nie aus der Benachrichtigung.
 */
export async function processPaymentUpdate(
  db: Database,
  boss: PgBoss,
  provider: PaymentProvider,
  providerPaymentId: string,
  actor: "webhook" | "rueckkehr",
): Promise<PaymentUpdateResult> {
  const id = providerPaymentId.slice(0, 100);
  const [event] = await db
    .insert(paymentEvents)
    .values({ provider: provider.name, providerPaymentId: id })
    .returning({ id: paymentEvents.id });
  const finish = (fetchedStatus: string | null, error: string | null) =>
    db
      .update(paymentEvents)
      .set({ fetchedStatus, error, processedAt: new Date() })
      .where(eq(paymentEvents.id, event!.id));

  const fetched = await provider.getPayment(id);
  if (!fetched) {
    await finish(null, "beim Anbieter unbekannt");
    return { outcome: "ignored", reason: "unbekannte Zahlung" };
  }
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.provider, provider.name), eq(payments.providerPaymentId, id)));
  if (!payment) {
    await finish(fetched.status, "keine passende Zahlung bei uns");
    return { outcome: "ignored", reason: "keine passende Zahlung" };
  }
  if (
    fetched.amountCents !== payment.amountCents ||
    fetched.currency !== payment.currency ||
    (fetched.orderId && fetched.orderId !== payment.orderId)
  ) {
    await finish(fetched.status, "Betrag, Währung oder Bestellung stimmen nicht überein");
    return { outcome: "ignored", reason: "Abweichung" };
  }

  const outcome = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).for("update");
    if (!order) return "unchanged" as const;
    if (fetched.status !== payment.status) {
      await tx
        .update(payments)
        .set({ status: fetched.status, updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    }
    if (fetched.status === "paid" && order.status === "awaiting_payment") {
      await transitionOrder(tx, order.id, "paid", {
        actor,
        reason: `Zahlung ${id} bestätigt (Status beim Anbieter abgefragt)`,
        markPaid: true,
      });
      await enqueue(boss, QUEUES.orderPaid, { orderId: order.id }, { tx, singletonKey: order.id });
      return "paid" as const;
    }
    if (FAILED_PAYMENT_STATUSES.includes(fetched.status) && order.status === "awaiting_payment") {
      // Nur zurücksetzen, wenn keine andere Zahlung dieser Bestellung noch offen ist
      const [stillOpen] = await tx
        .select({ n: count() })
        .from(payments)
        .where(
          and(
            eq(payments.orderId, order.id),
            inArray(payments.status, ["open", "pending", "authorized", "paid"]),
          ),
        );
      if ((stillOpen?.n ?? 0) === 0) {
        await transitionOrder(tx, order.id, "preview_ready", {
          actor,
          reason: `Zahlung ${id}: ${fetched.status}`,
        });
        return "failed" as const;
      }
    }
    return "unchanged" as const;
  });
  await finish(fetched.status, null);
  return { outcome };
}

/** Bei der Rückkehr von der Bezahlseite: offene Zahlungen der Bestellung beim Anbieter nachfragen. */
export async function syncOrderPayments(
  db: Database,
  boss: PgBoss,
  provider: PaymentProvider,
  orderId: string,
) {
  const open = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.orderId, orderId),
        eq(payments.provider, provider.name),
        inArray(payments.status, ["open", "pending", "authorized"]),
      ),
    );
  for (const p of open) await processPaymentUpdate(db, boss, provider, p.providerPaymentId, "rueckkehr");
}

export async function getPriceSnapshot(db: Database, orderId: string) {
  const [snap] = await db.select().from(priceSnapshots).where(eq(priceSnapshots.orderId, orderId));
  return snap ?? null;
}

/** Bezahlseite einer noch offenen Zahlung (für „Zur Bezahlseite zurück“). */
export async function getOpenCheckoutUrl(db: Database, orderId: string): Promise<string | null> {
  const [open] = await db
    .select({ url: payments.checkoutUrl })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), inArray(payments.status, ["open", "pending", "authorized"])))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  return open?.url ?? null;
}
