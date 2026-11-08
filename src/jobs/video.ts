import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Database } from "@/db/client";
import {
  lyricsVersions,
  musicCandidates,
  musicJobs,
  orders,
  previewClips,
  selectedTracks,
  videoJobs,
  videoTemplates,
  videos,
} from "@/db/schema";
import type { MediaTools } from "@/media/ffmpeg";
import { probeVideo, renderStandardVideo, resolveFontFile, type VideoTemplateConfig } from "@/media/video";
import { transitionOrder } from "@/orders/service";
import type { StorageProvider } from "@/storage";
import { enqueue } from "./enqueue";
import { QUEUES } from "./queues";

/**
 * Nach der Zahlung (M8): Song festlegen und Video erzeugen.
 * Ausgeliefert wird der Kandidat, aus dem die Hörprobe stammt – der Kunde bekommt genau den
 * Song, den er probegehört hat.
 */

export const DEFAULT_TEMPLATE = "standard_gradient";

/** Startet das Video: Song festlegen, Status „Video wird erstellt“, Auftrag anlegen (eine Transaktion). */
export async function startVideo(db: Database, boss: PgBoss, orderId: string): Promise<string> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  if (order.status !== "paid") return `übersprungen (Status ${order.status})`;

  const [preview] = await db
    .select({ candidateId: previewClips.candidateId })
    .from(previewClips)
    .innerJoin(musicCandidates, eq(previewClips.candidateId, musicCandidates.id))
    .innerJoin(musicJobs, eq(musicCandidates.jobId, musicJobs.id))
    .where(eq(musicJobs.orderId, orderId))
    .orderBy(desc(previewClips.createdAt))
    .limit(1);
  if (!preview) throw new Error("Kein Song mit Hörprobe gefunden");

  await db.transaction(async (tx) => {
    await tx
      .insert(selectedTracks)
      .values({ orderId, candidateId: preview.candidateId, selectedBy: "auto" })
      .onConflictDoNothing({ target: selectedTracks.orderId });
    await transitionOrder(tx, orderId, "video_rendering", { actor: "worker", reason: "Zahlung bestätigt" });
    await enqueue(boss, QUEUES.videoRender, { orderId }, { tx, singletonKey: `${orderId}:customer` });
  });
  return "Video angestoßen";
}

export type VideoDeps = {
  db: Database;
  storage: StorageProvider;
  tools: MediaTools;
  fontFile?: string | null;
};

export class VideoCheckFailedError extends Error {
  constructor(detail: string) {
    super(`Videoprüfung nicht bestanden: ${detail}`);
    this.name = "VideoCheckFailedError";
  }
}

/** Erzeugt, prüft und speichert das Kundenvideo; danach ist die Bestellung „fertig“. */
export async function renderCustomerVideo({ db, storage, tools, fontFile }: VideoDeps, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  if (order.status !== "video_rendering") return `übersprungen (Status ${order.status})`;

  const [template] = await db.select().from(videoTemplates).where(eq(videoTemplates.slug, DEFAULT_TEMPLATE));
  if (!template) throw new Error(`Videovorlage ${DEFAULT_TEMPLATE} fehlt`);

  const key = `video:${orderId}:customer`;
  await db
    .insert(videoJobs)
    .values({ orderId, templateId: template.id, variant: "customer", idempotencyKey: key })
    .onConflictDoNothing({ target: videoJobs.idempotencyKey });
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.idempotencyKey, key));
  if (!job) throw new Error("Videoauftrag fehlt");

  // Fertiges Video aus einem früheren Versuch? Dann nur noch den Status nachziehen
  const [existing] = await db.select().from(videos).where(eq(videos.jobId, job.id));
  if (existing) {
    await transitionOrder(db, orderId, "completed", { actor: "worker", reason: "Video war bereits fertig" });
    return "Video war bereits fertig";
  }
  await db
    .update(videoJobs)
    .set({ status: "running", attempt: job.attempt + 1, updatedAt: new Date(), error: null })
    .where(eq(videoJobs.id, job.id));

  const [track] = await db
    .select({ storageKey: musicCandidates.storageKey, durationMs: musicCandidates.durationMs })
    .from(selectedTracks)
    .innerJoin(musicCandidates, eq(selectedTracks.candidateId, musicCandidates.id))
    .where(eq(selectedTracks.orderId, orderId));
  if (!track) throw new Error("Kein festgelegter Song");
  const [lyrics] = await db
    .select({ title: lyricsVersions.title })
    .from(lyricsVersions)
    .where(and(eq(lyricsVersions.orderId, orderId), isNotNull(lyricsVersions.approvedAt)))
    .orderBy(desc(lyricsVersions.version))
    .limit(1);

  const workDir = await mkdtemp(path.join(tmpdir(), "melomio-video-"));
  try {
    const audio = await storage.open(track.storageKey);
    if (!audio) throw new Error("Songdatei fehlt im Speicher");
    const audioFile = path.join(workDir, "song.mp3");
    await writeFile(audioFile, Buffer.from(await new Response(audio.stream).arrayBuffer()));

    const outputFile = path.join(workDir, "video.mp4");
    const config = template.config as VideoTemplateConfig;
    await renderStandardVideo(tools, {
      workDir,
      audioFile,
      outputFile,
      title: lyrics?.title ?? "Dein Song",
      durationMs: track.durationMs,
      fontFile: resolveFontFile(fontFile),
      testWatermark: order.isTest,
      config,
    });

    // Prüfung: Format, Auflösung, Spuren, Länge = Songlänge
    const info = await probeVideo(tools, outputFile);
    const width = config.width ?? 1080;
    const height = config.height ?? 1920;
    const problems = [
      info.width !== width || info.height !== height ? `Auflösung ${info.width}×${info.height}` : null,
      info.videoCodec !== "h264" ? `Videoformat ${info.videoCodec}` : null,
      info.audioCodec !== "aac" ? `Tonformat ${info.audioCodec}` : null,
      Math.abs(info.durationMs - track.durationMs) > 1000
        ? `Länge ${info.durationMs} ms statt ${track.durationMs} ms`
        : null,
    ].filter(Boolean);
    if (problems.length) {
      await db
        .update(videoJobs)
        .set({ status: "failed", error: problems.join("; "), updatedAt: new Date() })
        .where(eq(videoJobs.id, job.id));
      throw new VideoCheckFailedError(problems.join("; "));
    }

    const storageKey = `videos/${orderId}/${job.id}.mp4`;
    await storage.putFile(storageKey, outputFile);
    await db.transaction(async (tx) => {
      await tx
        .insert(videos)
        .values({
          orderId,
          jobId: job.id,
          variant: "customer",
          storageKey,
          width,
          height,
          durationMs: info.durationMs,
        })
        .onConflictDoNothing({ target: videos.jobId });
      await tx
        .update(videoJobs)
        .set({ status: "succeeded", updatedAt: new Date() })
        .where(eq(videoJobs.id, job.id));
      await transitionOrder(tx, orderId, "completed", { actor: "worker", reason: "Video fertig" });
    });
    return "Video fertig – Bestellung abgeschlossen";
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
