import { sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss } from "pg-boss";
import type { Database } from "@/db/client";
import type { OrderJobData, QueueName } from "./queues";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Legt einen Auftrag an. Mit `tx` geschieht das in derselben Datenbank-Transaktion wie die
 * übrigen Änderungen: Entweder entsteht beides (z. B. Bestellung UND Auftrag) oder nichts.
 * `singletonKey` verhindert, dass derselbe Auftrag gleichzeitig mehrfach in der Warteschlange steht.
 */
export async function enqueue(
  boss: PgBoss,
  name: QueueName,
  data: OrderJobData,
  options: { tx?: Tx; singletonKey?: string; startAfterSeconds?: number } = {},
): Promise<string | null> {
  return boss.send(name, data, {
    singletonKey: options.singletonKey,
    startAfter: options.startAfterSeconds,
    ...(options.tx ? { db: fromDrizzle(options.tx, sql) } : {}),
  });
}
