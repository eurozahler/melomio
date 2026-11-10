import {
  centsToDecimal,
  decimalToCents,
  PAYMENT_STATUSES,
  type CreatePaymentInput,
  type FetchedPayment,
  type PaymentProvider,
  type PaymentStatus,
} from "./types";

/**
 * Mollie über die Payments API (die Orders API empfiehlt Mollie nicht mehr; ANBIETERPRUEFUNG.md §6).
 * Testschlüssel test_… → Testmodus mit simulierter Bezahlseite, keine echten Zahlungen.
 * `fetch` nur für Tests austauschbar.
 */

const API = "https://api.mollie.com/v2";

type MolliePayment = {
  id: string;
  status: string;
  amount: { currency: string; value: string };
  metadata?: { orderId?: string } | null;
  _links?: { checkout?: { href: string } };
};

function toStatus(value: string): PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value) ? (value as PaymentStatus) : "pending";
}

export function createMollieProvider(
  apiKey: string,
  options: { fetch?: typeof globalThis.fetch } = {},
): PaymentProvider {
  const doFetch = options.fetch ?? globalThis.fetch;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  return {
    name: "mollie",
    mode: apiKey.startsWith("live_") ? "live" : "test",

    async createPayment(input: CreatePaymentInput) {
      const res = await doFetch(`${API}/payments`, {
        method: "POST",
        headers: { ...headers, "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({
          amount: { currency: input.currency, value: centsToDecimal(input.amountCents) },
          description: input.description,
          redirectUrl: input.redirectUrl,
          ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
          metadata: input.metadata,
        }),
      });
      if (!res.ok) throw new Error(`Mollie: Zahlung konnte nicht angelegt werden (HTTP ${res.status})`);
      const payment = (await res.json()) as MolliePayment;
      const checkoutUrl = payment._links?.checkout?.href;
      if (!checkoutUrl) throw new Error("Mollie: keine Bezahlseite erhalten");
      return { providerPaymentId: payment.id, checkoutUrl, status: toStatus(payment.status) };
    },

    async getPayment(providerPaymentId: string): Promise<FetchedPayment | null> {
      // Nur echte Mollie-IDs abfragen (tr_…); alles andere kann keine Zahlung sein
      if (!/^tr_[A-Za-z0-9]+$/.test(providerPaymentId)) return null;
      const res = await doFetch(`${API}/payments/${providerPaymentId}`, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Mollie: Status nicht abrufbar (HTTP ${res.status})`);
      const p = (await res.json()) as MolliePayment;
      return {
        providerPaymentId: p.id,
        status: toStatus(p.status),
        amountCents: decimalToCents(p.amount.value),
        currency: p.amount.currency,
        orderId: p.metadata?.orderId ?? null,
      };
    },

    async refund({ providerPaymentId, amountCents, currency, description }) {
      if (!/^tr_[A-Za-z0-9]+$/.test(providerPaymentId)) throw new Error("Mollie: ungültige Zahlungs-ID");
      const res = await doFetch(`${API}/payments/${providerPaymentId}/refunds`, {
        method: "POST",
        headers,
        body: JSON.stringify({ amount: { currency, value: centsToDecimal(amountCents) }, description }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(
          `Mollie: Erstattung abgelehnt (HTTP ${res.status})${body.detail ? `: ${body.detail}` : ""}`,
        );
      }
      const r = (await res.json()) as { id: string; status: string };
      // queued/pending → pending; processing; refunded
      const status =
        r.status === "refunded" ? "refunded" : r.status === "processing" ? "processing" : "pending";
      return { providerRefundId: r.id, status };
    },
  };
}
