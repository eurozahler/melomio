import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { seed } from "@/db/seed";
import { appSettings, musicCandidates, orders, previewUsage } from "@/db/schema";
import { createBoss } from "@/jobs/boss";
import { handleLyricsGenerate, handleMusicGenerate } from "@/jobs/handlers";
import { findPreviewClip, QualityCheckFailedError, runPreviewMusic } from "@/jobs/music";
import { QUEUES } from "@/jobs/queues";
import { probeAudio } from "@/media/ffmpeg";
import { approveLyrics, LyricsActionError } from "@/orders/lyrics";
import { transitionOrder } from "@/orders/service";
import type { StorageProvider } from "@/storage";
import { connectTestDb, createUserWithOrder, TEST_STORAGE_DIR, testDeps } from "./helpers";

const { db, pool } = connectTestDb();
let boss: PgBoss;

async function setSetting(key: string, value: number) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

beforeAll(async () => {
  process.env.MOCK_MUSIC_DELAY_MS = "0";
  process.env.MOCK_MUSIC_DURATION_S = "60";
  await seed(db);
  await setSetting("song_target_duration_s", 60);
  boss = createBoss(process.env.DATABASE_URL_TEST!, "sender");
  await boss.start();
});

beforeEach(async () => {
  delete process.env.MOCK_MUSIC_MODE;
  await setSetting("previews_daily_budget", 50);
  await setSetting("previews_per_account", 1);
});

afterAll(async () => {
  await boss.stop({ graceful: false });
  await pool.end();
  await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
});

async function statusOf(orderId: string) {
  const [o] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  return o?.status;
}

/** Bestellung mit Songtext in Prüfung (ohne Freigabe). */
async function orderInReview() {
  const { userId, order } = await createUserWithOrder(db);
  await transitionOrder(db, order.id, "lyrics_generating", { actor: "test" });
  await handleLyricsGenerate(testDeps(db, boss), { orderId: order.id, targetVersion: 1 });
  return { userId, order };
}

async function approvedOrder() {
  const r = await orderInReview();
  await approveLyrics(db, boss, r.order.publicRef, r.userId);
  return r;
}

describe("Freigabe startet die Musik (Hörprobe vormerken)", () => {
  it("merkt die Hörprobe vor und legt den Musikauftrag an", async () => {
    const { order } = await approvedOrder();
    expect(await statusOf(order.id)).toBe("lyrics_approved");
    expect(await db.select().from(previewUsage).where(eq(previewUsage.orderId, order.id))).toHaveLength(1);
    const jobs = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from pgboss.job where name = ${QUEUES.musicGenerate} and data->>'orderId' = ${order.id}`,
    );
    expect(jobs.rows[0]?.n).toBe(1);
  });

  it("Limit pro Konto: die zweite Hörprobe wird abgelehnt, der Songtext bleibt bearbeitbar", async () => {
    const first = await approvedOrder();
    // zweite Bestellung desselben Kontos
    const second = await createUserWithOrder(db);
    await db.update(orders).set({ userId: first.userId }).where(eq(orders.id, second.order.id));
    await transitionOrder(db, second.order.id, "lyrics_generating", { actor: "test" });
    await handleLyricsGenerate(testDeps(db, boss), { orderId: second.order.id, targetVersion: 1 });

    await expect(approveLyrics(db, boss, second.order.publicRef, first.userId)).rejects.toMatchObject({
      code: "preview_limit",
    });
    expect(await statusOf(second.order.id)).toBe("lyrics_review");
  });

  it("Tagesbudget erreicht: keine weitere Hörprobe (Kostenbremse)", async () => {
    await setSetting("previews_daily_budget", 0);
    const { userId, order } = await orderInReview();
    const error = await approveLyrics(db, boss, order.publicRef, userId).catch((e) => e);
    expect(error).toBeInstanceOf(LyricsActionError);
    expect(error.code).toBe("preview_budget");
    expect(await statusOf(order.id)).toBe("lyrics_review");
  });
});

describe("Musik erzeugen und Hörprobe schneiden (Abnahme M6)", () => {
  it("Kandidat geprüft, volle Datei geschützt gespeichert, 20-Sekunden-Hörprobe ab dem Refrain", async () => {
    const { order } = await approvedOrder();
    const deps = testDeps(db, boss);
    const result = await handleMusicGenerate(deps, { orderId: order.id });
    expect(result.status).toBe("executed");
    expect(await statusOf(order.id)).toBe("preview_ready");

    const candidates = await db.execute<{ qc_status: string; storage_key: string; duration_ms: number }>(
      sql`select c.qc_status, c.storage_key, c.duration_ms from music_candidates c join music_jobs j on j.id = c.job_id where j.order_id = ${order.id}`,
    );
    expect(candidates.rows).toHaveLength(1);
    expect(candidates.rows[0]).toMatchObject({ qc_status: "passed", duration_ms: 60_000 });
    expect(candidates.rows[0]?.storage_key).toMatch(/^songs\//);

    const clip = await findPreviewClip(db, order.id);
    expect(clip?.storageKey).toMatch(/^previews\//);
    expect(clip?.durationMs).toBe(20_000);
    const preview = await probeAudio(deps.tools, `${TEST_STORAGE_DIR}/${clip!.storageKey}`);
    expect(Math.abs(preview.durationMs - 20_000)).toBeLessThan(200);

    const start = await db.execute<{ start_ms: number; start_method: string }>(
      sql`select start_ms, start_method from preview_clips where storage_key = ${clip!.storageKey}`,
    );
    // Refrain beginnt beim Test-Song bei 30 % von 60 s = 18 s
    expect(start.rows[0]).toEqual({ start_ms: 18_000, start_method: "provider_sections" });
  });

  it("eine stumme Datei fällt in der Prüfung durch", async () => {
    process.env.MOCK_MUSIC_MODE = "silent";
    const { order } = await approvedOrder();
    await expect(runPreviewMusic(testDeps(db, boss), order.id)).rejects.toBeInstanceOf(
      QualityCheckFailedError,
    );
    expect(await statusOf(order.id)).toBe("music_generating");
    expect(await findPreviewClip(db, order.id)).toBeNull();
  });

  it("ein abgebrochener Auftrag wird wiederholt, ohne den fertigen Kandidaten neu zu erzeugen", async () => {
    const { order } = await approvedOrder();
    const deps = testDeps(db, boss);
    // Erster Versuch bricht beim Speichern der Hörprobe ab (z. B. Speicher nicht erreichbar)
    const flaky: StorageProvider = {
      ...deps.storage,
      async putFile(key, file) {
        if (key.startsWith("previews/")) throw new Error("Speicher vorübergehend nicht erreichbar");
        return deps.storage.putFile(key, file);
      },
    };
    await expect(runPreviewMusic({ ...deps, storage: flaky }, order.id)).rejects.toThrow(/nicht erreichbar/);

    // Zweiter Versuch: Kandidat wird wiederverwendet, nur die Hörprobe entsteht neu
    await runPreviewMusic(deps, order.id);
    const candidates = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from music_candidates c join music_jobs j on j.id = c.job_id where j.order_id = ${order.id}`,
    );
    expect(candidates.rows[0]?.n).toBe(1);
    expect(await statusOf(order.id)).toBe("preview_ready");
  });

  it("Musik-Schritt für eine Bestellung im falschen Status tut nichts", async () => {
    const { order } = await orderInReview();
    expect(await runPreviewMusic(testDeps(db, boss), order.id)).toMatch(/übersprungen/);
    expect(await db.select().from(musicCandidates)).toBeDefined();
  });
});
