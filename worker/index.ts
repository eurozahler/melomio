/**
 * Hintergrund-Worker (Modul M4): arbeitet die Aufträge aus der Warteschlange ab.
 * Start: npm run worker   (läuft dauerhaft, beenden mit Strg+C)
 *
 * Stürzt der Worker ab oder wird er beendet, bleiben die Aufträge in der Datenbank. Nach dem
 * Neustart macht er dort weiter: Abgebrochene Aufträge werden nach ihrer Zeitüberschreitung
 * erneut versucht, und der Idempotenzschlüssel verhindert doppelte Ausführung.
 */
import { loadEnvConfig } from "@next/env";
import type { JobWithMetadata } from "pg-boss";
import { EnvError, getEnv } from "../src/config/env";
import { createDb } from "../src/db/client";
import { createBoss } from "../src/jobs/boss";
import * as handlers from "../src/jobs/handlers";
import { ensureQueues, QUEUES, type LyricsJobData } from "../src/jobs/queues";
import { getLyricsProvider } from "../src/lyrics";

// Die Konfiguration wird erst beim ersten getEnv() gelesen – daher reicht es, sie hier zu laden
loadEnvConfig(process.cwd());

type OrderJob = JobWithMetadata<LyricsJobData>;

async function main() {
  let env;
  try {
    env = getEnv();
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const { db, pool } = createDb(env.DATABASE_URL, { max: 5 });
  const boss = createBoss(env.DATABASE_URL, "worker");
  await boss.start();
  await ensureQueues(boss);
  const lyrics = getLyricsProvider(env);
  const deps = { db, boss, lyrics };

  function logResult(job: OrderJob, result: unknown) {
    const value = (result as { status?: string; value?: unknown }) ?? {};
    const detail = value.status === "executed" ? String(value.value) : value.status;
    console.log(
      `[worker] ${job.name} ${job.data.orderId.slice(0, 8)} (Versuch ${job.retryCount + 1}): ${detail}`,
    );
  }

  await boss.work(QUEUES.orderStart, { includeMetadata: true, batchSize: 1 }, async ([job]: OrderJob[]) => {
    if (!job) return;
    const result = await handlers.withFinalFailure(db, job, () =>
      handlers.handleOrderStart(deps, job.data, `${job.id}:${job.retryCount}`),
    );
    logResult(job, result);
  });

  await boss.work(
    QUEUES.lyricsGenerate,
    { includeMetadata: true, batchSize: 1 },
    async ([job]: OrderJob[]) => {
      if (!job) return;
      const result = await handlers.withFinalFailure(db, job, () =>
        handlers.handleLyricsGenerate(deps, job.data, `${job.id}:${job.retryCount}`),
      );
      logResult(job, result);
    },
  );

  await boss.work(QUEUES.cleanupDrafts, async () => {
    console.log(`[worker] Aufräumen: ${await handlers.handleCleanupDrafts(deps)}`);
  });
  // Täglich um 3:30 Uhr (deutsche Zeit) aufräumen
  await boss.schedule(QUEUES.cleanupDrafts, "30 3 * * *", null, { tz: "Europe/Berlin" });

  console.log(
    `[worker] bereit – ${env.isTestOperation ? "TESTBETRIEB" : "LIVEBETRIEB"} – Songtext: ${lyrics.name} – Warteschlangen: ${Object.values(QUEUES).join(", ")}`,
  );

  let stopping = false;
  async function shutdown(signal: string) {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} empfangen – laufende Aufträge werden noch beendet …`);
    await boss.stop({ graceful: true, timeout: 30_000 });
    await pool.end();
    console.log("[worker] beendet.");
    process.exit(0);
  }
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[worker] Start fehlgeschlagen:", error);
  process.exit(1);
});
