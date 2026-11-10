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
import { getMusicProvider, mediaToolsFromEnv } from "../src/music";
import { getStorage } from "../src/storage";
import { runWatchdog, writeHeartbeat } from "../src/monitoring/watchdog";
import { workerVersion } from "./version";

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
  const tools = mediaToolsFromEnv(env);
  const music = getMusicProvider(env, tools);
  const storage = getStorage(env);
  const deps = {
    db,
    boss,
    lyrics,
    music,
    storage,
    tools,
    baseUrl: env.APP_BASE_URL,
    fontFile: env.VIDEO_FONT_FILE,
  };

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

  await boss.work(
    QUEUES.musicGenerate,
    { includeMetadata: true, batchSize: 1 },
    async ([job]: OrderJob[]) => {
      if (!job) return;
      const result = await handlers.withFinalFailure(db, job, () =>
        handlers.handleMusicGenerate(deps, job.data, `${job.id}:${job.retryCount}`),
      );
      logResult(job, result);
    },
  );

  await boss.work(QUEUES.orderPaid, { includeMetadata: true, batchSize: 1 }, async ([job]: OrderJob[]) => {
    if (!job) return;
    // Kein „failed“ für die Bestellung: Die Zahlung ist erfolgt, nur die E-Mail wird wiederholt
    const result = await handlers.handleOrderPaid(deps, job.data, `${job.id}:${job.retryCount}`);
    logResult(job, result);
  });

  await boss.work(QUEUES.videoRender, { includeMetadata: true, batchSize: 1 }, async ([job]: OrderJob[]) => {
    if (!job) return;
    const result = await handlers.withFinalFailure(db, job, () =>
      handlers.handleVideoRender(deps, job.data, `${job.id}:${job.retryCount}`),
    );
    logResult(job, result);
  });

  await boss.work(QUEUES.cleanupDrafts, async () => {
    console.log(`[worker] Aufräumen: ${await handlers.handleCleanupDrafts(deps)}`);
  });
  // Täglich um 3:30 Uhr (deutsche Zeit) aufräumen
  await boss.schedule(QUEUES.cleanupDrafts, "30 3 * * *", null, { tz: "Europe/Berlin" });

  // Wächter alle 15 Minuten, Lebenszeichen jede Minute (C9)
  await boss.work(QUEUES.watchdog, async () => {
    const findings = await runWatchdog(db, music, { lowBalanceCents: env.MUREKA_LOW_BALANCE_CENTS });
    if (findings.length) console.log(`[worker] Wächter: ${findings.join(", ")}`);
  });
  await boss.schedule(QUEUES.watchdog, "*/15 * * * *", null, { tz: "Europe/Berlin" });
  const beat = () =>
    writeHeartbeat(db, workerVersion()).catch((e) => console.error("[worker] Lebenszeichen:", e));
  await beat();
  const heartbeat = setInterval(beat, 60_000);

  console.log(
    `[worker] bereit – ${env.isTestOperation ? "TESTBETRIEB" : "LIVEBETRIEB"} – Stand ${workerVersion()} – Songtext: ${lyrics.name} – Musik: ${music.name} – Warteschlangen: ${Object.values(QUEUES).join(", ")}`,
  );

  let stopping = false;
  async function shutdown(signal: string) {
    if (stopping) return;
    stopping = true;
    clearInterval(heartbeat);
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
