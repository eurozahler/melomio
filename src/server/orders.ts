import "server-only";
import { desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { getDb } from "@/db/client";
import { occasions, orders } from "@/db/schema";

export type OrderListItem = {
  id: string;
  publicRef: string;
  status: (typeof orders.$inferSelect)["status"];
  occasionName: string;
  createdAt: Date;
};

/**
 * Bestellungen EINES Kontos. Jede Abfrage von Kundendaten filtert zwingend nach dem Konto
 * (docs/ARCHITEKTUR.md, Abschnitt 6) – Kunde A sieht nie die Bestellungen von Kunde B.
 */
export async function listOrdersForUser(userId: string, db: Database = getDb()): Promise<OrderListItem[]> {
  const rows = await db
    .select({
      id: orders.id,
      publicRef: orders.publicRef,
      status: orders.status,
      occasionName: occasions.name,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(occasions, eq(orders.occasionId, occasions.id))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));
  return rows.map((r) => ({ ...r, occasionName: r.occasionName.de }));
}
