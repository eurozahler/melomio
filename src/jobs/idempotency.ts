import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { jobExecutions } from "@/db/schema";

/** Ein Schritt, der seit dieser Zeit „läuft“, gilt als abgestürzt und darf neu versucht werden. */
const STALE_AFTER_MS = 10 * 60 * 1000;

export type IdempotentResult<T> = { status: "executed"; value: T } | { status: "skipped" | "busy" };

/** Wird geworfen, wenn derselbe Schritt gerade woanders läuft – pg-boss versucht es dann später erneut. */
export class StepBusyError extends Error {
  constructor(key: string) {
    super(`Schritt ${key} läuft bereits – neuer Versuch später`);
    this.name = "StepBusyError";
  }
}

/**
 * Führt `fn` für einen Idempotenzschlüssel höchstens einmal erfolgreich aus (Abnahme M4):
 * - bereits erfolgreich → übersprungen ("skipped")
 * - läuft gerade woanders → nicht doppelt starten ("busy")
 * - fehlgeschlagen oder abgestürzt → neuer Versuch erlaubt
 *
 * `attempt`: Kennung des Versuchs aus der Warteschlange. Gibt pg-boss einen NEUEN Versuch desselben
 * Auftrags aus, hat es den vorherigen bereits für abgestürzt erklärt (ausbleibende Lebenszeichen) –
 * der neue Versuch darf dann sofort übernehmen, statt auf die Zeitgrenze zu warten.
 */
export async function runIdempotent<T>(
  db: Database,
  key: string,
  fn: () => Promise<T>,
  options: { attempt?: string } = {},
): Promise<IdempotentResult<T>> {
  const attempt = options.attempt ?? null;
  const claim = await db.transaction(async (tx) => {
    await tx.insert(jobExecutions).values({ idempotencyKey: key, status: "failed" }).onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(jobExecutions)
      .where(eq(jobExecutions.idempotencyKey, key))
      .for("update");
    if (!row) throw new Error(`Ausführungsprotokoll für ${key} fehlt`);
    if (row.status === "succeeded") return "skipped" as const;
    const recent = Date.now() - row.startedAt.getTime() < STALE_AFTER_MS;
    const sameOrUnknownAttempt = attempt === null || row.attemptToken === attempt;
    if (row.status === "running" && recent && sameOrUnknownAttempt) return "busy" as const;
    await tx
      .update(jobExecutions)
      .set({
        status: "running",
        attempts: sql`${jobExecutions.attempts} + 1`,
        attemptToken: attempt,
        startedAt: new Date(),
        error: null,
      })
      .where(eq(jobExecutions.idempotencyKey, key));
    return "claimed" as const;
  });
  if (claim !== "claimed") return { status: claim };

  try {
    const value = await fn();
    await db
      .update(jobExecutions)
      .set({ status: "succeeded", finishedAt: new Date() })
      .where(eq(jobExecutions.idempotencyKey, key));
    return { status: "executed", value };
  } catch (error) {
    await db
      .update(jobExecutions)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message.slice(0, 1000) : String(error),
      })
      .where(eq(jobExecutions.idempotencyKey, key));
    throw error;
  }
}
