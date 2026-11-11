import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import sharp from "sharp";
import { addPhoto, listPhotos } from "@/orders/photos";
import { seed } from "@/db/seed";
import { orders, selectedTracks, videos } from "@/db/schema";
import { createBoss } from "@/jobs/boss";
import { handleOrderPaid, handleVideoRender } from "@/jobs/handlers";
import { QUEUES } from "@/jobs/queues";
import { probeVideo } from "@/media/video";
import { processPaymentUpdate, startCheckout } from "@/orders/checkout";
import { createMockPaymentProvider, setMockPaymentStatus } from "@/payments/mock";
import { disableSharePage, enableSharePage, findActiveShare } from "@/orders/delivery";
import {
  connectTestDb,
  createUserWithOrder,
  orderWithRealPreview,
  setSetting,
  TEST_STORAGE_DIR,
  testDeps,
  useShortSongs,
} from "./helpers";

const { db, pool } = connectTestDb();
let boss: PgBoss;

beforeAll(async () => {
  await seed(db);
  await useShortSongs(db);
  // ohne zweite Song-Version: Video direkt nach der Zahlung (die zweite Version testet versions.test.ts)
  await setSetting(db, "music_extra_candidates_after_purchase", 0);
  boss = createBoss(process.env.DATABASE_URL_TEST!, "sender");
  await boss.start();
});

afterAll(async () => {
  await boss.stop({ graceful: false });
  await pool.end();
  await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
});

async function paidOrder() {
  const { userId, order } = await orderWithRealPreview(db, boss);
  const provider = createMockPaymentProvider(db, "http://localhost:3200");
  const url = await startCheckout(db, provider, {
    publicRef: order.publicRef,
    userId,
    accepted: { termsPrivacy: true, withdrawalWaiver: true },
    ipHash: null,
    baseUrl: "http://localhost:3200",
    webhookUrl: null,
  });
  const id = url.split("/dev/zahlung/")[1]!;
  await setMockPaymentStatus(db, id, "paid");
  await processPaymentUpdate(db, boss, provider, id, "webhook");
  return { userId, order };
}

async function statusOf(orderId: string) {
  const [o] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  return o?.status;
}

describe("Standardvideo (Abnahme M8) und Auslieferung (M9)", () => {
  it("nach der Zahlung: Song festgelegt, Video 1080×1920 H.264/AAC in Songlänge, Bestellung fertig", async () => {
    const { order } = await paidOrder();
    const deps = testDeps(db, boss);

    await handleOrderPaid(deps, { orderId: order.id });
    expect(await statusOf(order.id)).toBe("video_rendering");
    expect(await db.select().from(selectedTracks).where(eq(selectedTracks.orderId, order.id))).toHaveLength(
      1,
    );
    const jobs = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from pgboss.job where name = ${QUEUES.videoRender} and data->>'orderId' = ${order.id}`,
    );
    expect(jobs.rows[0]?.n).toBe(1);

    await handleVideoRender(deps, { orderId: order.id });
    expect(await statusOf(order.id)).toBe("completed");
    const [video] = await db.select().from(videos).where(eq(videos.orderId, order.id));
    expect(video).toMatchObject({ width: 1080, height: 1920, variant: "customer" });
    expect(video?.storageKey).toMatch(/^videos\//);

    const info = await probeVideo(deps.tools, `${TEST_STORAGE_DIR}/${video!.storageKey}`);
    expect(info).toMatchObject({ width: 1080, height: 1920, videoCodec: "h264", audioCodec: "aac" });
    expect(Math.abs(info.durationMs - 60_000)).toBeLessThanOrEqual(1000);
  }, 180_000);

  it("ein wiederholter Auftrag erzeugt kein zweites Video", async () => {
    const { order } = await paidOrder();
    const deps = testDeps(db, boss);
    await handleOrderPaid(deps, { orderId: order.id });
    await handleVideoRender(deps, { orderId: order.id });
    await handleOrderPaid(deps, { orderId: order.id });
    await handleVideoRender(deps, { orderId: order.id });
    expect(await db.select().from(videos).where(eq(videos.orderId, order.id))).toHaveLength(1);
  }, 180_000);

  it("nach Abschluss: E-Mail „Song fertig“ (einmal) und Song-Seite ein-/ausschaltbar", async () => {
    const { userId, order } = await paidOrder();
    const deps = testDeps(db, boss);
    await handleOrderPaid(deps, { orderId: order.id });
    await handleVideoRender(deps, { orderId: order.id });
    await handleVideoRender(deps, { orderId: order.id });

    const mails = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from dev_mailbox m join users u on u.email = m.recipient where u.id = ${userId} and m.template = 'song-ready'`,
    );
    expect(mails.rows[0]?.n).toBe(1);

    const share = await enableSharePage(db, order.publicRef, userId);
    expect(share?.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await findActiveShare(db, share!.token)).not.toBeNull();
    // fremdes Konto kann nicht einschalten
    const { userId: stranger } = await createUserWithOrder(db);
    expect(await enableSharePage(db, order.publicRef, stranger)).toBeNull();

    await disableSharePage(db, order.publicRef, userId);
    expect(await findActiveShare(db, share!.token)).toBeNull();
    // erneut einschalten ergibt einen NEUEN Link
    const again = await enableSharePage(db, order.publicRef, userId);
    expect(again?.token).not.toBe(share!.token);
    expect(await findActiveShare(db, share!.token)).toBeNull();
  }, 180_000);

  it("ohne Zahlung entsteht kein Video", async () => {
    const { order } = await orderWithRealPreview(db, boss);
    const deps = testDeps(db, boss);
    expect((await handleVideoRender(deps, { orderId: order.id })).status).toBe("executed");
    expect(await db.select().from(videos).where(eq(videos.orderId, order.id))).toHaveLength(0);
    expect(await statusOf(order.id)).toBe("preview_ready");
  }, 120_000);
});

describe("Fotos im Video (C2)", () => {
  it("hochgeladene Fotos laufen als Slideshow; nach dem Kauf sind Fotos nicht mehr änderbar", async () => {
    const { userId, order } = await orderWithRealPreview(db, boss);
    const deps = testDeps(db, boss);
    const img = (c: string) =>
      sharp({ create: { width: 1200, height: 900, channels: 3, background: c } })
        .jpeg()
        .toBuffer();
    await addPhoto(db, deps.storage, order.publicRef, userId, await img("#aa3355"));
    await addPhoto(db, deps.storage, order.publicRef, userId, await img("#3355aa"));
    expect(await listPhotos(db, order.id)).toHaveLength(2);

    const provider = createMockPaymentProvider(db, "http://localhost:3200");
    const url = await startCheckout(db, provider, {
      publicRef: order.publicRef,
      userId,
      accepted: { termsPrivacy: true, withdrawalWaiver: true },
      ipHash: null,
      baseUrl: "http://localhost:3200",
      webhookUrl: null,
    });
    const id = url.split("/dev/zahlung/")[1]!;
    await setMockPaymentStatus(db, id, "paid");
    await processPaymentUpdate(db, boss, provider, id, "webhook");
    await expect(
      addPhoto(db, deps.storage, order.publicRef, userId, await img("#000")),
    ).rejects.toMatchObject({
      code: "locked",
    });

    await handleOrderPaid(deps, { orderId: order.id });
    await handleVideoRender(deps, { orderId: order.id });
    expect(await statusOf(order.id)).toBe("completed");
    const [video] = await db.select().from(videos).where(eq(videos.orderId, order.id));
    const info = await probeVideo(deps.tools, `${TEST_STORAGE_DIR}/${video!.storageKey}`);
    expect(info).toMatchObject({ width: 1080, height: 1920, videoCodec: "h264", audioCodec: "aac" });
    expect(Math.abs(info.durationMs - 60_000)).toBeLessThanOrEqual(1000);
  }, 240_000);
});

describe("Abschiedsvideo (C11)", () => {
  it("ein Foto in Schwarz-Weiß, Name, Daten, Spruch und Aufruf zum Teilen – gültiges Video", async () => {
    const { mkdtemp, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const os = await import("node:os");
    const { generateTestSong } = await import("@/media/ffmpeg");
    const { renderStandardVideo, resolveFontFile } = await import("@/media/video");
    const deps = testDeps(db, boss);
    const dir = await mkdtemp(path.join(os.tmpdir(), "memorial-"));
    try {
      const audio = path.join(dir, "song.mp3");
      await generateTestSong(deps.tools, audio, { durationS: 20, introS: 2 });
      const photo = path.join(dir, "foto.jpg");
      await writeFile(
        photo,
        await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#cc3366" } })
          .jpeg()
          .toBuffer(),
      );
      const out = path.join(dir, "video.mp4");
      await renderStandardVideo(deps.tools, {
        workDir: dir,
        audioFile: audio,
        outputFile: out,
        title: "Für Erika",
        durationMs: 20_000,
        fontFile: resolveFontFile(process.env.VIDEO_FONT_FILE),
        testWatermark: false,
        photos: [photo, photo],
        memorial: {
          name: "Erika Muster",
          dates: "* 03.04.1950   † 01.11.2026",
          saying: "Du bist nicht mehr da, wo du warst, aber überall, wo wir sind.",
          share: "Teile dieses Video, um Erika auf eine letzte Reise um die Welt zu schicken.",
        },
      });
      const info = await probeVideo(deps.tools, out);
      expect(info).toMatchObject({ width: 1080, height: 1920, videoCodec: "h264", audioCodec: "aac" });
      // Schwarz-Weiß: ein Bild aus der Mitte hat (fast) keine Farbsättigung
      const frame = path.join(dir, "frame.png");
      const { execFile } = await import("node:child_process");
      await new Promise<void>((resolve, reject) =>
        execFile(deps.tools.ffmpeg, ["-y", "-ss", "5", "-i", out, "-frames:v", "1", frame], (e) =>
          e ? reject(e) : resolve(),
        ),
      );
      const stats = await sharp(frame).stats();
      const [r, g, b] = stats.channels.map((c) => c.mean);
      expect(Math.abs(r! - g!)).toBeLessThan(3);
      expect(Math.abs(g! - b!)).toBeLessThan(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
