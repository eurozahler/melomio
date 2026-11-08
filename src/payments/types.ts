/**
 * Austauschbare Schnittstelle für Zahlungen (docs/ARCHITEKTUR.md, Abschnitte 3 und 8).
 * Grundsatz: Eine Bestellung gilt NUR als bezahlt, wenn der Server den Status selbst beim
 * Anbieter abgefragt hat – nie aufgrund der Rückleitung oder des Webhook-Inhalts.
 */

export const PAYMENT_STATUSES = [
  "open",
  "pending",
  "authorized",
  "paid",
  "failed",
  "canceled",
  "expired",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Endgültig gescheitert: Kunde kann es erneut versuchen. */
export const FAILED_PAYMENT_STATUSES: readonly PaymentStatus[] = ["failed", "canceled", "expired"];

export type CreatePaymentInput = {
  amountCents: number;
  currency: string;
  description: string;
  redirectUrl: string;
  /** null, wenn der Anbieter den Server nicht erreichen kann (z. B. localhost) */
  webhookUrl: string | null;
  metadata: { orderId: string; publicRef: string };
  /** Verhindert doppelte Zahlungen bei Doppelklick (Mollie: Header Idempotency-Key). */
  idempotencyKey: string;
};

export type CreatedPayment = { providerPaymentId: string; checkoutUrl: string; status: PaymentStatus };

export type FetchedPayment = {
  providerPaymentId: string;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  orderId: string | null;
};

export interface PaymentProvider {
  readonly name: "mock" | "mollie";
  readonly mode: "test" | "live";
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  /** Status direkt beim Anbieter abfragen. null = Zahlung existiert beim Anbieter nicht. */
  getPayment(providerPaymentId: string): Promise<FetchedPayment | null>;
}

/** Bruttopreis in Netto und Steuer zerlegen (Verbraucherpreise sind Bruttopreise). */
export function splitGross(grossCents: number, taxRateBp: number): { netCents: number; taxCents: number } {
  const netCents = Math.round((grossCents * 10_000) / (10_000 + taxRateBp));
  return { netCents, taxCents: grossCents - netCents };
}

/** 999 → "9.99" (Format der Mollie-API) */
export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function decimalToCents(value: string): number {
  return Math.round(Number(value) * 100);
}
