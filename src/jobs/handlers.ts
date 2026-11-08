import { eq, lt } from "drizzle-orm";
import type { JobWithMetadata, PgBoss } from "pg-boss";
import type { Database } from "@/db/client";
import { orders, questionnaireDrafts } from "@/db/schema";
import { enqueue } from "./enqueue";
import { runIdempotent, StepBusyError, type IdempotentResult } from "./idempotency";
import { QUEUES, type OrderJobData } from "./queues";
import { transitionOrder } from "@/orders/service";

/**
 * Arbeitsschritte des Workers. Jeder Schritt
 * - prüft zuerst den aktuellen Status (passt er nicht, ist der Schritt schon erledigt → nichts tun),
 * - läuft über einen Idempotenzschlüssel höchstens einmal erfolgreich,
 * - setzt die Bestellung nach dem letzten fehlgeschlagenen Versuch auf „failed“.
 */

export type HandlerDeps = { db: Database; boss: PgBoss };

/** „Läuft schon“ darf einen Auftrag nie still als erledigt markieren – sonst bliebe die Bestellung hängen. */
function failIfBusy<T>(key: string, result: IdempotentResult<T>): IdempotentResult<T> {
  if (result.status === "busy") throw new StepBusyError(key);
  return result;
}

/** Platzhalter-Dauer des Songtext-Schritts bis Modul M5 (für Tests verkürzbar). */
function stubDelayMs(): number {
  const value = Number(process.env.LYRICS_STUB_DELAY_MS ?? 3000);
  return Number.isFinite(value) && value >= 0 ? value : 3000;
}

async function loadOrder(db: Database, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  return order;
}

/** order.start: neue Bestellung → Songtext erzeugen (oder bei eigenem Songtext direkt zur Prüfung). */
export async function handleOrderStart(
  { db, boss }: HandlerDeps,
  { orderId }: OrderJobData,
  attempt?: string,
) {
  const key = `order.start:${orderId}`;
  const result = await runIdempotent(
    db,
    key,
    async () => {
      const order = await loadOrder(db, orderId);
      if (order.status !== "created") return "übersprungen (Status bereits weiter)";
      if (order.customLyrics) {
        await transitionOrder(db, orderId, "lyrics_review", { actor: "worker", reason: "eigener Songtext" });
        return "eigener Songtext → Prüfung";
      }
      await db.transaction(async (tx) => {
        await transitionOrder(tx, orderId, "lyrics_generating", { actor: "worker" });
        await enqueue(boss, QUEUES.lyricsGenerate, { orderId }, { tx, singletonKey: orderId });
      });
      return "Songtext angestoßen";
    },
    { attempt },
  );
  return failIfBusy(key, result);
}

/**
 * lyrics.generate: Platzhalter bis Modul M5. Wartet kurz und setzt die Bestellung auf „Songtext
 * bereit zur Prüfung“. In M5 entsteht hier der echte Songtext (Mock bzw. Claude).
 */
export async function handleLyricsGenerate({ db }: HandlerDeps, { orderId }: OrderJobData, attempt?: string) {
  const key = `lyrics.generate:${orderId}:1`;
  const result = await runIdempotent(
    db,
    key,
    async () => {
      const order = await loadOrder(db, orderId);
      if (order.status !== "lyrics_generating") return "übersprungen (Status passt nicht)";
      await new Promise((resolve) => setTimeout(resolve, stubDelayMs()));
      await transitionOrder(db, orderId, "lyrics_review", {
        actor: "worker",
        reason: "Platzhalter – echter Songtext folgt in Modul M5",
      });
      return "Songtext-Platzhalter fertig";
    },
    { attempt },
  );
  return failIfBusy(key, result);
}

/** Aufräumen: Fragebogen-Entwürfe nach Ablauf (30 Tage) löschen. */
export async function handleCleanupDrafts({ db }: HandlerDeps) {
  const deleted = await db
    .delete(questionnaireDrafts)
    .where(lt(questionnaireDrafts.expiresAt, new Date()))
    .returning({ id: questionnaireDrafts.id });
  return `${deleted.length} abgelaufene Entwürfe gelöscht`;
}

/**
 * Gemeinsame Fehlerbehandlung: Beim letzten erlaubten Versuch wird die Bestellung auf „failed“
 * gesetzt (mit Grund), damit sie im Admin auffällt und wiederholt werden kann.
 */
export async function withFinalFailure(
  db: Database,
  job: JobWithMetadata<OrderJobData>,
  fn: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await fn();
  } catch (error) {
    const lastAttempt = job.retryCount >= job.retryLimit;
    if (lastAttempt) {
      const reason =
        `${job.name} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500);
      await transitionOrder(db, job.data.orderId, "failed", { actor: "worker", reason }).catch((e) =>
        console.error(`[worker] Konnte Bestellung ${job.data.orderId} nicht auf failed setzen:`, e),
      );
    }
    throw error;
  }
}
