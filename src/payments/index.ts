import type { AppEnv } from "@/config/env";
import type { Database } from "@/db/client";
import { createMockPaymentProvider } from "./mock";
import { createMollieProvider } from "./mollie";
import type { PaymentProvider } from "./types";

export * from "./types";

export function getPaymentProvider(
  env: Pick<AppEnv, "PAYMENT_PROVIDER" | "MOLLIE_API_KEY" | "APP_BASE_URL">,
  db: Database,
): PaymentProvider {
  if (env.PAYMENT_PROVIDER === "mollie") {
    if (!env.MOLLIE_API_KEY) throw new Error("MOLLIE_API_KEY fehlt");
    return createMollieProvider(env.MOLLIE_API_KEY);
  }
  return createMockPaymentProvider(db, env.APP_BASE_URL);
}

/** Mollie kann localhost nicht erreichen – dort ohne Webhook (Status wird bei der Rückkehr abgefragt). */
export function webhookUrlFor(baseUrl: string): string | null {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)
    ? null
    : `${baseUrl}/api/webhooks/zahlung`;
}
