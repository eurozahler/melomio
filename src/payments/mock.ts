import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { devMockPayments } from "@/db/schema";
import type { CreatePaymentInput, FetchedPayment, PaymentProvider, PaymentStatus } from "./types";

/**
 * Test-Zahlungsanbieter (Mock): eigene Testseite /dev/zahlung/<id> mit den Knöpfen
 * „erfolgreich“, „fehlgeschlagen“, „abgebrochen“. Kein echtes Geld (Testbetrieb).
 */
export function createMockPaymentProvider(db: Database, baseUrl: string): PaymentProvider {
  return {
    name: "mock",
    mode: "test",
    async createPayment(input: CreatePaymentInput) {
      const [existing] = await db
        .select()
        .from(devMockPayments)
        .where(eq(devMockPayments.idempotencyKey, input.idempotencyKey));
      const row =
        existing ??
        (
          await db
            .insert(devMockPayments)
            .values({
              id: `mock_${randomUUID().replaceAll("-", "")}`,
              amountCents: input.amountCents,
              currency: input.currency,
              description: input.description,
              redirectUrl: input.redirectUrl,
              metadata: input.metadata,
              idempotencyKey: input.idempotencyKey,
            })
            .returning()
        )[0];
      if (!row) throw new Error("Test-Zahlung konnte nicht angelegt werden");
      return { providerPaymentId: row.id, checkoutUrl: `${baseUrl}/dev/zahlung/${row.id}`, status: "open" };
    },
    async getPayment(id: string): Promise<FetchedPayment | null> {
      const [row] = await db.select().from(devMockPayments).where(eq(devMockPayments.id, id));
      if (!row) return null;
      return {
        providerPaymentId: row.id,
        status: row.status as PaymentStatus,
        amountCents: row.amountCents,
        currency: row.currency,
        orderId: row.metadata.orderId ?? null,
      };
    },
  };
}

/** Testseite: Status einer Test-Zahlung setzen (spielt die Bezahlseite des Anbieters). */
export async function setMockPaymentStatus(db: Database, id: string, status: "paid" | "failed" | "canceled") {
  const [row] = await db
    .update(devMockPayments)
    .set({ status, updatedAt: new Date() })
    .where(eq(devMockPayments.id, id))
    .returning();
  return row ?? null;
}
