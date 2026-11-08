// @vitest-environment node
import { describe, expect, it } from "vitest";
import { webhookUrlFor } from "@/payments";
import { createMollieProvider } from "@/payments/mollie";
import { centsToDecimal, splitGross } from "@/payments/types";

describe("Preise", () => {
  it("zerlegt den Bruttopreis in Netto und MwSt. (19 %)", () => {
    expect(splitGross(999, 1900)).toEqual({ netCents: 839, taxCents: 160 });
    expect(splitGross(3990, 1900)).toEqual({ netCents: 3353, taxCents: 637 });
    expect(splitGross(1000, 0)).toEqual({ netCents: 1000, taxCents: 0 });
  });

  it("formatiert Beträge für Mollie", () => {
    expect(centsToDecimal(999)).toBe("9.99");
    expect(centsToDecimal(1000)).toBe("10.00");
  });
});

describe("Webhook-Adresse", () => {
  it("auf localhost gibt es keinen Webhook (Mollie erreicht den PC nicht)", () => {
    expect(webhookUrlFor("http://localhost:3000")).toBeNull();
    expect(webhookUrlFor("https://melomio.de")).toBe("https://melomio.de/api/webhooks/zahlung");
  });
});

/** Attrappe der Mollie-API: zeichnet Anfragen auf, antwortet mit vorbereiteten Daten. */
function fakeMollie(responder: (url: string, init?: RequestInit) => { status: number; body?: unknown }) {
  const calls: Array<{ url: string; method: string; headers: Headers; body: unknown }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const r = responder(String(url), init);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetchImpl };
}

describe("Mollie-Anbindung (ohne echten Aufruf)", () => {
  it("legt eine Zahlung über die Payments API mit Idempotency-Key an", async () => {
    const { calls, fetchImpl } = fakeMollie(() => ({
      status: 201,
      body: {
        id: "tr_abc123",
        status: "open",
        amount: { currency: "EUR", value: "9.99" },
        _links: { checkout: { href: "https://www.mollie.com/checkout/test/abc" } },
      },
    }));
    const mollie = createMollieProvider("test_key", { fetch: fetchImpl });
    expect(mollie.mode).toBe("test");
    const created = await mollie.createPayment({
      amountCents: 999,
      currency: "EUR",
      description: "melomio Song M-ABC123",
      redirectUrl: "http://localhost:3000/bestellung/M-ABC123?zahlung=zurueck",
      webhookUrl: null,
      metadata: { orderId: "o1", publicRef: "M-ABC123" },
      idempotencyKey: "o1:1",
    });
    expect(created).toEqual({
      providerPaymentId: "tr_abc123",
      checkoutUrl: "https://www.mollie.com/checkout/test/abc",
      status: "open",
    });
    const call = calls[0]!;
    expect(call.url).toBe("https://api.mollie.com/v2/payments");
    expect(call.method).toBe("POST");
    expect(call.headers.get("Idempotency-Key")).toBe("o1:1");
    expect(call.headers.get("Authorization")).toBe("Bearer test_key");
    expect(call.body).toMatchObject({
      amount: { currency: "EUR", value: "9.99" },
      metadata: { orderId: "o1" },
    });
    expect(call.body).not.toHaveProperty("webhookUrl");
  });

  it("fragt den Status ab und ignoriert IDs, die keine Mollie-Zahlungen sein können", async () => {
    const { calls, fetchImpl } = fakeMollie((url) =>
      url.endsWith("tr_paid1")
        ? {
            status: 200,
            body: {
              id: "tr_paid1",
              status: "paid",
              amount: { currency: "EUR", value: "9.99" },
              metadata: { orderId: "o1" },
            },
          }
        : { status: 404, body: { status: 404 } },
    );
    const mollie = createMollieProvider("test_key", { fetch: fetchImpl });
    expect(await mollie.getPayment("tr_paid1")).toEqual({
      providerPaymentId: "tr_paid1",
      status: "paid",
      amountCents: 999,
      currency: "EUR",
      orderId: "o1",
    });
    expect(await mollie.getPayment("tr_unknown")).toBeNull();
    // Unsinnige oder gefährliche IDs werden gar nicht erst abgefragt
    expect(await mollie.getPayment("../../v2/refunds")).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("ein Live-Schlüssel ergibt den Livemodus", () => {
    expect(createMollieProvider("live_key").mode).toBe("live");
  });
});
