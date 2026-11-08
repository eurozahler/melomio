import { and, desc, eq, lt } from "drizzle-orm";
import type { JobWithMetadata, PgBoss } from "pg-boss";
import type { Database } from "@/db/client";
import { lyricsVersions, orders, questionnaireDrafts } from "@/db/schema";
import { buildLyricsInput, getActiveSystemPrompt, lyricsSchema, type LyricsProvider } from "@/lyrics";
import type { MediaTools } from "@/media/ffmpeg";
import type { MusicProvider } from "@/music/types";
import type { StorageProvider } from "@/storage";
import { runPreviewMusic } from "./music";
import { sendOrderConfirmation, sendSongReady } from "./order-paid";
import { renderCustomerVideo, startVideo } from "./video";
import { transitionOrder } from "@/orders/service";
import { enqueue } from "./enqueue";
import { runIdempotent, StepBusyError, type IdempotentResult } from "./idempotency";
import { QUEUES, type LyricsJobData, type OrderJobData } from "./queues";

/**
 * Arbeitsschritte des Workers. Jeder Schritt
 * - prüft zuerst den aktuellen Status (passt er nicht, ist der Schritt schon erledigt → nichts tun),
 * - läuft über einen Idempotenzschlüssel höchstens einmal erfolgreich,
 * - setzt die Bestellung nach dem letzten fehlgeschlagenen Versuch auf „failed“.
 */

export type HandlerDeps = {
  db: Database;
  boss: PgBoss;
  lyrics: LyricsProvider;
  music: MusicProvider;
  storage: StorageProvider;
  tools: MediaTools;
  /** Öffentliche Adresse der Seite – für Links in E-Mails. */
  baseUrl: string;
  /** Schriftdatei für Videos (optional, sonst Systemschrift). */
  fontFile?: string | null;
};

/** „Läuft schon“ darf einen Auftrag nie still als erledigt markieren – sonst bliebe die Bestellung hängen. */
function failIfBusy<T>(key: string, result: IdempotentResult<T>): IdempotentResult<T> {
  if (result.status === "busy") throw new StepBusyError(key);
  return result;
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
        await enqueue(
          boss,
          QUEUES.lyricsGenerate,
          { orderId, targetVersion: 1 },
          { tx, singletonKey: `${orderId}:1` },
        );
      });
      return "Songtext angestoßen";
    },
    { attempt },
  );
  return failIfBusy(key, result);
}

/**
 * lyrics.generate: Songtext erzeugen (Fassung 1) oder neu formulieren (weitere Fassungen).
 * Der Aufruf beim Anbieter passiert außerhalb der Datenbank-Transaktion; gespeichert wird die
 * neue Fassung zusammen mit dem Statuswechsel – nie das eine ohne das andere.
 */
export async function handleLyricsGenerate(
  { db, lyrics }: HandlerDeps,
  { orderId, targetVersion = 1, feedback = null }: LyricsJobData,
  attempt?: string,
) {
  const key = `lyrics.generate:${orderId}:${targetVersion}`;
  const result = await runIdempotent(
    db,
    key,
    async () => {
      const order = await loadOrder(db, orderId);
      if (order.status !== "lyrics_generating") return "übersprungen (Status passt nicht)";

      const [existing] = await db
        .select({ id: lyricsVersions.id })
        .from(lyricsVersions)
        .where(and(eq(lyricsVersions.orderId, orderId), eq(lyricsVersions.version, targetVersion)));

      if (!existing) {
        const { input, flagged } = await buildLyricsInput(db, orderId);
        const prompt = await getActiveSystemPrompt(db);
        const [previous] = await db
          .select()
          .from(lyricsVersions)
          .where(eq(lyricsVersions.orderId, orderId))
          .orderBy(desc(lyricsVersions.version))
          .limit(1);

        const generated =
          targetVersion > 1 && previous
            ? await lyrics.revise(
                input,
                {
                  previous: lyricsSchema.parse({
                    title: previous.title,
                    sections: previous.content.sections,
                  }),
                  feedback,
                },
                prompt.template,
                prompt.model,
              )
            : await lyrics.generate(input, prompt.template, prompt.model);

        await db.transaction(async (tx) => {
          await tx.insert(lyricsVersions).values({
            orderId,
            version: targetVersion,
            title: generated.title,
            content: { sections: generated.sections },
            source: targetVersion > 1 ? "ai_revision" : "ai",
            promptVersionId: prompt.id,
          });
          await transitionOrder(tx, orderId, "lyrics_review", {
            actor: "worker",
            reason: `Fassung ${targetVersion} von ${lyrics.name}/${generated.model}${flagged ? " (Eingaben gefiltert)" : ""}`,
          });
        });
        return `Songtext-Fassung ${targetVersion} fertig (${lyrics.name})`;
      }

      // Fassung existiert schon (z. B. Absturz nach dem Speichern): nur noch den Status nachziehen
      await transitionOrder(db, orderId, "lyrics_review", {
        actor: "worker",
        reason: "Fassung bereits vorhanden",
      });
      return `Songtext-Fassung ${targetVersion} war schon gespeichert`;
    },
    { attempt },
  );
  return failIfBusy(key, result);
}

/** music.generate: Musik erzeugen, prüfen, Hörprobe schneiden (M6). */
export async function handleMusicGenerate(deps: HandlerDeps, { orderId }: OrderJobData, attempt?: string) {
  const key = `music.generate:${orderId}:preview`;
  const result = await runIdempotent(deps.db, key, () => runPreviewMusic(deps, orderId), { attempt });
  return failIfBusy(key, result);
}

/**
 * order.paid: (1) Bestellbestätigung verschicken (rechtlich wichtig, E16), (2) Video starten –
 * beide Schritte jeweils höchstens einmal. Schlägt ein Schritt fehl, wird der Auftrag wiederholt;
 * der bereits erledigte Schritt wird dabei übersprungen.
 */
export async function handleOrderPaid(deps: HandlerDeps, { orderId }: OrderJobData, attempt?: string) {
  const mailKey = `email:order-confirmation:${orderId}`;
  failIfBusy(
    mailKey,
    await runIdempotent(deps.db, mailKey, () => sendOrderConfirmation(deps.db, deps.baseUrl, orderId), {
      attempt,
    }),
  );
  const videoKey = `video.start:${orderId}`;
  return failIfBusy(
    videoKey,
    await runIdempotent(deps.db, videoKey, () => startVideo(deps.db, deps.boss, orderId), { attempt }),
  );
}

/** video.render: Kundenvideo erzeugen, prüfen, speichern → Bestellung „fertig“. */
export async function handleVideoRender(deps: HandlerDeps, { orderId }: OrderJobData, attempt?: string) {
  const key = `video.render:${orderId}:customer`;
  const result = failIfBusy(
    key,
    await runIdempotent(deps.db, key, () => renderCustomerVideo(deps, orderId), { attempt }),
  );
  // Danach: E-Mail „Dein Song ist fertig“ (höchstens einmal) – nur wenn die Bestellung wirklich
  // fertig ist; sonst würde der Schritt als „erledigt“ verbucht und die E-Mail käme nie
  const order = await loadOrder(deps.db, orderId);
  if (order.status === "completed") {
    const mailKey = `email:song-ready:${orderId}`;
    failIfBusy(
      mailKey,
      await runIdempotent(deps.db, mailKey, () => sendSongReady(deps.db, deps.baseUrl, orderId), { attempt }),
    );
  }
  return result;
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
