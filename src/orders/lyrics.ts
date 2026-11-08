import { and, count, desc, eq, gte, max, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Database } from "@/db/client";
import { lyricsVersions, orders, previewUsage } from "@/db/schema";
import { getSetting } from "@/db/settings-store";
import { enqueue } from "@/jobs/enqueue";
import { QUEUES } from "@/jobs/queues";
import { lyricsSchema, type Lyrics } from "@/lyrics/types";
import { transitionOrder } from "./service";

/**
 * Songtext prüfen, bearbeiten, neu formulieren lassen, freigeben (Modul M5, F-18).
 * Jede Aktion prüft: Gehört die Bestellung diesem Konto? Steht sie auf „Songtext bereit zur Prüfung“?
 */

export type LyricsActionErrorCode =
  "not_found" | "wrong_status" | "limit_reached" | "invalid" | "preview_limit" | "preview_budget";

export class LyricsActionError extends Error {
  constructor(public readonly code: LyricsActionErrorCode) {
    super(`Songtext-Aktion abgelehnt: ${code}`);
    this.name = "LyricsActionError";
  }
}

export const REVISION_FEEDBACK_MAX = 500;

/** Bestellung eines Kontos über die Bestellnummer. Fremde Bestellungen gibt es für dieses Konto nicht. */
export async function getOwnedOrder(db: Database, publicRef: string, userId: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.publicRef, publicRef), eq(orders.userId, userId)));
  return order ?? null;
}

export async function listLyricsVersions(db: Database, orderId: string) {
  return db
    .select()
    .from(lyricsVersions)
    .where(eq(lyricsVersions.orderId, orderId))
    .orderBy(desc(lyricsVersions.version));
}

export async function countAiRevisions(db: Database, orderId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(lyricsVersions)
    .where(and(eq(lyricsVersions.orderId, orderId), eq(lyricsVersions.source, "ai_revision")));
  return row?.n ?? 0;
}

export async function nextLyricsVersion(
  db: Database | Parameters<Parameters<Database["transaction"]>[0]>[0],
  orderId: string,
) {
  const [row] = await db
    .select({ v: max(lyricsVersions.version) })
    .from(lyricsVersions)
    .where(eq(lyricsVersions.orderId, orderId));
  return (row?.v ?? 0) + 1;
}

/** Übersicht für die Prüfseite: aktuelle Fassung und verbleibende KI-Neuformulierungen. */
export async function getLyricsReview(db: Database, publicRef: string, userId: string) {
  const order = await getOwnedOrder(db, publicRef, userId);
  if (!order) return null;
  const [versions, used, allowed] = await Promise.all([
    listLyricsVersions(db, order.id),
    countAiRevisions(db, order.id),
    getSetting(db, "lyrics_ai_revisions_free"),
  ]);
  return {
    order,
    current: versions[0] ?? null,
    versionCount: versions.length,
    revisionsLeft: Math.max(0, allowed - used),
  };
}

async function requireReviewable(db: Database, publicRef: string, userId: string) {
  const order = await getOwnedOrder(db, publicRef, userId);
  if (!order) throw new LyricsActionError("not_found");
  if (order.status !== "lyrics_review") throw new LyricsActionError("wrong_status");
  return order;
}

/** Selbst bearbeiten: unbegrenzt, ohne KI (F-18). Legt eine neue Fassung an. */
export async function saveCustomerEdit(db: Database, publicRef: string, userId: string, input: unknown) {
  const parsed = lyricsSchema.safeParse(input);
  if (!parsed.success) throw new LyricsActionError("invalid");
  const order = await requireReviewable(db, publicRef, userId);
  return db.transaction(async (tx) => {
    // Status unter Sperre erneut prüfen (gleichzeitige Freigabe in einem anderen Tab)
    const [locked] = await tx.select().from(orders).where(eq(orders.id, order.id)).for("update");
    if (locked?.status !== "lyrics_review") throw new LyricsActionError("wrong_status");
    const version = await nextLyricsVersion(tx, order.id);
    await tx.insert(lyricsVersions).values({
      orderId: order.id,
      version,
      title: parsed.data.title,
      content: { sections: parsed.data.sections },
      source: "customer_edit",
    });
    return version;
  });
}

/** „KI neu formulieren lassen“: begrenzt durch die Einstellung lyrics_ai_revisions_free (Standard 1). */
export async function requestAiRevision(
  db: Database,
  boss: PgBoss,
  publicRef: string,
  userId: string,
  feedback: string | null,
) {
  const cleanFeedback = feedback?.trim().slice(0, REVISION_FEEDBACK_MAX) || null;
  const order = await requireReviewable(db, publicRef, userId);
  const [used, allowed] = await Promise.all([
    countAiRevisions(db, order.id),
    getSetting(db, "lyrics_ai_revisions_free"),
  ]);
  if (used >= allowed) throw new LyricsActionError("limit_reached");

  await db.transaction(async (tx) => {
    const targetVersion = await nextLyricsVersion(tx, order.id);
    await transitionOrder(tx, order.id, "lyrics_generating", {
      actor: userId,
      reason: cleanFeedback ? `KI neu formulieren: ${cleanFeedback}` : "KI neu formulieren",
    });
    await enqueue(
      boss,
      QUEUES.lyricsGenerate,
      { orderId: order.id, targetVersion, feedback: cleanFeedback },
      { tx, singletonKey: `${order.id}:${targetVersion}` },
    );
  });
}

/**
 * Freigeben: Die aktuelle Fassung wird endgültig; danach sind keine Änderungen mehr möglich.
 * Gleichzeitig wird die Hörprobe vorgemerkt und die Musik in Auftrag gegeben (E12) – vorher
 * werden das Limit pro Konto und das Tagesbudget geprüft (Kostenbremse, L16). Ist ein Limit
 * erreicht, bleibt der Songtext unverändert bearbeitbar.
 */
export async function approveLyrics(db: Database, boss: PgBoss, publicRef: string, userId: string) {
  const order = await requireReviewable(db, publicRef, userId);
  const [perAccount, dailyBudget] = await Promise.all([
    getSetting(db, "previews_per_account"),
    getSetting(db, "previews_daily_budget"),
  ]);

  await db.transaction(async (tx) => {
    // Gleichzeitige Freigaben nacheinander abarbeiten, damit das Tagesbudget nicht überschritten wird
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('melomio:preview-budget'))`);

    const [mine] = await tx.select({ n: count() }).from(previewUsage).where(eq(previewUsage.userId, userId));
    if ((mine?.n ?? 0) >= perAccount) throw new LyricsActionError("preview_limit");
    const [today] = await tx
      .select({ n: count() })
      .from(previewUsage)
      .where(
        gte(
          previewUsage.createdAt,
          sql`(date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')`,
        ),
      );
    if ((today?.n ?? 0) >= dailyBudget) throw new LyricsActionError("preview_budget");

    const [latest] = await tx
      .select()
      .from(lyricsVersions)
      .where(eq(lyricsVersions.orderId, order.id))
      .orderBy(desc(lyricsVersions.version))
      .limit(1);
    if (!latest) throw new LyricsActionError("invalid");
    await tx.update(lyricsVersions).set({ approvedAt: new Date() }).where(eq(lyricsVersions.id, latest.id));
    await transitionOrder(tx, order.id, "lyrics_approved", {
      actor: userId,
      reason: `Fassung ${latest.version} freigegeben`,
    });
    await tx.insert(previewUsage).values({ userId, orderId: order.id });
    await enqueue(
      boss,
      QUEUES.musicGenerate,
      { orderId: order.id },
      { tx, singletonKey: `${order.id}:preview` },
    );
  });
}

export type { Lyrics };
