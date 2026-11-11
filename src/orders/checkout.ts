import { and, count, desc, eq, inArray, lte } from "drizzle-orm";
import { getCompanyProfile } from "@/invoices/company";
import { billingSchema, type BillingAddress } from "./billing";
import { buildPriceItems, publicationOffer, resolveCode, type AppliedCode } from "./pricing";
import type { PgBoss } from "pg-boss";
import type { Database } from "@/db/client";
import {
  affiliateAttributions,
  consents,
  occasions,
  orderItems,
  orders,
  paymentEvents,
  payments,
  priceSnapshots,
  prices,
  products,
  taxRates,
  voucherRedemptions,
} from "@/db/schema";
import { CONSENT_TEXTS, type CheckoutConsentType } from "@/domain/consents";
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

export type CheckoutErrorCode =
  | "not_found"
  | "wrong_status"
  | "consents_required"
  | "no_price"
  | "seller_incomplete"
  | "billing_invalid"
  | "voucher_invalid"
  | "publication_invalid";

export class CheckoutError extends Error {
  constructor(public readonly code: CheckoutErrorCode) {
    super(`Checkout abgelehnt: ${code}`);
    this.name = "CheckoutError";
  }
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Preis-Snapshot der Bestellung – beim ersten Checkout aus dem aktuellen Preis erzeugt.
 * Ändert der Kunde vor der Zahlung Code oder Veröffentlichung, wird der Snapshot neu erzeugt –
 * der einmal eingefrorene Grundpreis bleibt dabei erhalten.
 */
async function ensurePriceSnapshot(
  tx: Tx,
  orderId: string,
  opts: { publicationPct: number | null; code: AppliedCode | null },
) {
  const [existing] = await tx.select().from(priceSnapshots).where(eq(priceSnapshots.orderId, orderId));
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
  const frozen = existing?.items.find((i) => i.productSlug === "song");
  const base = frozen
    ? { productSlug: frozen.productSlug, name: frozen.name, unitGrossCents: frozen.unitGrossCents }
    : { productSlug: row.product.slug, name: row.product.name.de, unitGrossCents: row.price.grossCents };
  const taxRateBp = existing?.taxRateBp ?? row.tax.rateBp;
  const currency = existing?.currency ?? row.price.currency;
  const breakdown = buildPriceItems(base, opts);

  if (existing) {
    if (JSON.stringify(existing.items) === JSON.stringify(breakdown.items)) return existing;
    // Rabatte geändert (vor der Zahlung): Preis neu einfrieren
    await tx.delete(voucherRedemptions).where(eq(voucherRedemptions.orderId, orderId));
    await tx.delete(affiliateAttributions).where(eq(affiliateAttributions.orderId, orderId));
    await tx.delete(priceSnapshots).where(eq(priceSnapshots.orderId, orderId));
    await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
  }
  const { netCents, taxCents } = splitGross(breakdown.grossCents, taxRateBp);
  await tx
    .insert(orderItems)
    .values({ orderId, productId: row.product.id, quantity: 1, unitGrossCents: base.unitGrossCents });
  const [snapshot] = await tx
    .insert(priceSnapshots)
    .values({
      orderId,
      items: breakdown.items,
      netCents,
      taxCents,
      grossCents: breakdown.grossCents,
      taxRateBp,
      currency,
    })
    .returning();
  if (!snapshot) throw new CheckoutError("no_price");
  if (opts.code?.type === "voucher" && breakdown.codeDiscountCents > 0) {
    await tx
      .insert(voucherRedemptions)
      .values({ voucherId: opts.code.voucher.id, orderId, discountCents: breakdown.codeDiscountCents });
  }
  if (opts.code?.type === "affiliate") {
    await tx
      .insert(affiliateAttributions)
      .values({ codeId: opts.code.codeId, orderId, discountCents: breakdown.codeDiscountCents });
  }
  return snapshot;
}

/** Wahl zur Veröffentlichung aus dem Formular prüfen (null = keine Veröffentlichung). */
export function parsePublication(
  raw: unknown,
): { photos: boolean; title: boolean; memorial: boolean } | null | "invalid" {
  if (raw === null || raw === undefined || raw === false) return null;
  if (typeof raw !== "object") return "invalid";
  const r = raw as Record<string, unknown>;
  if (r.consent !== true) return null;
  for (const k of ["photos", "title", "memorial"]) {
    if (r[k] !== undefined && typeof r[k] !== "boolean") return "invalid";
  }
  return { photos: r.photos === true, title: r.title === true, memorial: r.memorial === true };
}

export type StartCheckoutInput = {
  publicRef: string;
  userId: string;
  accepted: { termsPrivacy: boolean; withdrawalWaiver: boolean };
  ipHash: string | null;
  baseUrl: string;
  webhookUrl: string | null;
  /** Optionale Rechnungsanschrift (Firmenkunden); null/undefined = Rechnung an das Konto. */
  billing?: unknown;
  /** Optionaler Code: Gutschein oder Affiliate-Code. */
  voucherCode?: string | null;
  /** Zustimmung zur Veröffentlichung (optional, mit Rabatt). */
  publication?: unknown;
  /** Warteschlange – nur nötig, wenn ein 100-%-Gutschein die Zahlung überspringt. */
  boss?: PgBoss;
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
  // Rechnungsanschrift (optional) prüfen und an der Bestellung speichern
  let billing: BillingAddress | null = null;
  if (input.billing) {
    const parsed = billingSchema.safeParse(input.billing);
    if (!parsed.success) throw new CheckoutError("billing_invalid");
    billing = parsed.data;
  }
  await db.update(orders).set({ billing }).where(eq(orders.id, order.id));

  // Ohne vollständige Firmendaten keine echte Rechnung – dann auch kein echter Verkauf
  if (!order.isTest && !(await getCompanyProfile(db)).complete) throw new CheckoutError("seller_incomplete");

  // Code (optional): Gutschein oder Affiliate-Code
  const code = input.voucherCode?.trim()
    ? await resolveCode(db, input.voucherCode, { userId: input.userId })
    : null;
  if (input.voucherCode?.trim() && !code) throw new CheckoutError("voucher_invalid");

  // Veröffentlichung (optional)
  const offer = await publicationOffer(db, order.occasionId);
  const publication = parsePublication(input.publication);
  if (publication === "invalid" || (publication && !offer.enabled))
    throw new CheckoutError("publication_invalid");
  const [occasion] = await db
    .select({ videoTemplate: occasions.videoTemplate })
    .from(occasions)
    .where(eq(occasions.id, order.occasionId));
  const memorial = occasion?.videoTemplate === "memorial";
  // Trauer: Veröffentlichung nur mit ausdrücklicher Beauftragung (E15)
  if (publication && memorial && !publication.memorial) throw new CheckoutError("publication_invalid");
  await db
    .update(orders)
    .set({ publication: publication ? { photos: publication.photos, title: publication.title } : null })
    .where(eq(orders.id, order.id));
  const consentTypes: CheckoutConsentType[] = [
    "terms_privacy",
    "withdrawal_waiver",
    ...(publication ? (["publication"] as const) : []),
    ...(publication?.photos ? (["publication_photos"] as const) : []),
    ...(publication && memorial ? (["publication_memorial"] as const) : []),
  ];

  // Preis einfrieren und Einwilligungen festhalten
  const snapshot = await db.transaction(async (tx) => {
    const snap = await ensurePriceSnapshot(tx, order.id, {
      publicationPct: publication ? offer.discountPct : null,
      code,
    });
    await tx.insert(consents).values(
      consentTypes.map((type) => ({
        userId: input.userId,
        orderId: order.id,
        type,
        textVersion: CONSENT_TEXTS[type].version,
        ipHash: input.ipHash,
      })),
    );
    return snap;
  });

  // 100-%-Gutschein: nichts zu bezahlen → direkt „bezahlt“, ohne Bezahlseite
  if (snapshot.grossCents === 0) {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(orders).where(eq(orders.id, order.id)).for("update");
      if (locked?.status === "preview_ready") {
        await transitionOrder(tx, order.id, "awaiting_payment", {
          actor: input.userId,
          reason: "Gutschein 100 %",
        });
      }
      if (locked && (locked.status === "preview_ready" || locked.status === "awaiting_payment")) {
        await tx
          .insert(payments)
          .values({
            orderId: order.id,
            provider: "voucher",
            providerPaymentId: `voucher-${order.id}`,
            status: "paid",
            amountCents: 0,
            currency: snapshot.currency,
            mode: provider.mode,
          })
          .onConflictDoNothing();
        await transitionOrder(tx, order.id, "paid", {
          actor: input.userId,
          reason: "Gutschein 100 % – nichts zu bezahlen",
          markPaid: true,
        });
        if (!input.boss) throw new Error("Warteschlange fehlt (Gratis-Bestellung)");
        await enqueue(input.boss, QUEUES.orderPaid, { orderId: order.id }, { tx, singletonKey: order.id });
      }
    });
    return `${input.baseUrl}/bestellung/${order.publicRef}?zahlung=zurueck`;
  }

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
