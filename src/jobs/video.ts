import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { listPhotos } from "@/orders/photos";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Database } from "@/db/client";
import {
  answers,
  lyricsVersions,
  occasions,
  questions,
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
import {
  probeVideo,
  renderStandardVideo,
  resolveFontFile,
  type MemorialText,
  type VideoTemplateConfig,
} from "@/media/video";
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

/** Kandidat, aus dem die Hörprobe stammt (der Song, den der Kunde vor dem Kauf gehört hat). */
export async function findPreviewCandidateId(db: Database, orderId: string): Promise<string | null> {
  const [preview] = await db
    .select({ candidateId: previewClips.candidateId })
    .from(previewClips)
    .innerJoin(musicCandidates, eq(previewClips.candidateId, musicCandidates.id))
    .innerJoin(musicJobs, eq(musicCandidates.jobId, musicJobs.id))
    .where(eq(musicJobs.orderId, orderId))
    .orderBy(desc(previewClips.createdAt))
    .limit(1);
  return preview?.candidateId ?? null;
}

/**
 * Startet das Video: Song festlegen, Status „Video wird erstellt“, Auftrag anlegen (eine Transaktion).
 * Ohne Angabe wird der Kandidat der Hörprobe genommen; eine bereits getroffene Auswahl bleibt bestehen.
 */
export async function startVideo(
  db: Database,
  boss: PgBoss,
  orderId: string,
  choice: {
    candidateId?: string;
    selectedBy?: "auto" | "customer" | "admin";
    actor?: string;
    reason?: string;
  } = {},
): Promise<string> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  if (order.status !== "paid" && order.status !== "awaiting_choice")
    return `übersprungen (Status ${order.status})`;

  const candidateId = choice.candidateId ?? (await findPreviewCandidateId(db, orderId));
  if (!candidateId) throw new Error("Kein Song mit Hörprobe gefunden");

  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (locked?.status !== "paid" && locked?.status !== "awaiting_choice")
      return "übersprungen (parallel gestartet)";
    await tx
      .insert(selectedTracks)
      .values({ orderId, candidateId, selectedBy: choice.selectedBy ?? "auto" })
      .onConflictDoNothing({ target: selectedTracks.orderId });
    await transitionOrder(tx, orderId, "video_rendering", {
      actor: choice.actor ?? "worker",
      reason: choice.reason ?? "Zahlung bestätigt",
    });
    await enqueue(boss, QUEUES.videoRender, { orderId }, { tx, singletonKey: `${orderId}:customer` });
    return "Video angestoßen";
  });
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

  const template = await loadTemplate(db);
  const job = await ensureVideoJob(db, orderId, template.id, "customer", `video:${orderId}:customer`);

  // Fertiges Video aus einem früheren Versuch? Dann nur noch den Status nachziehen
  const [existing] = await db.select().from(videos).where(eq(videos.jobId, job.id));
  if (existing) {
    await transitionOrder(db, orderId, "completed", { actor: "worker", reason: "Video war bereits fertig" });
    return "Video war bereits fertig";
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "melomio-video-"));
  try {
    const result = await produceVideo({ db, storage, tools, fontFile }, orderId, job.id, template, workDir, {
      photos: true,
      title: true,
      testWatermark: order.isTest,
    });
    const storageKey = `videos/${orderId}/${job.id}.mp4`;
    await storage.putFile(storageKey, result.outputFile);
    await db.transaction(async (tx) => {
      await tx
        .insert(videos)
        .values({
          orderId,
          jobId: job.id,
          variant: "customer",
          storageKey,
          width: result.width,
          height: result.height,
          durationMs: result.durationMs,
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

/**
 * Fassung für die Veröffentlichung (C7, E7): ohne Fotos, wenn der Kunde sie nicht freigegeben hat,
 * und ohne Titel, wenn er keine Namen zeigen will. Liefert die ID des gespeicherten Videos.
 */
export async function renderPublicationVideo(
  { db, storage, tools, fontFile }: VideoDeps,
  orderId: string,
  choice: { photos: boolean; title: boolean },
): Promise<string> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  const template = await loadTemplate(db);
  const job = await ensureVideoJob(db, orderId, template.id, "publication", `video:${orderId}:publication`);
  const [existing] = await db.select().from(videos).where(eq(videos.jobId, job.id));
  if (existing) return existing.id;

  const workDir = await mkdtemp(path.join(tmpdir(), "melomio-video-"));
  try {
    const result = await produceVideo({ db, storage, tools, fontFile }, orderId, job.id, template, workDir, {
      ...choice,
      testWatermark: order.isTest,
    });
    const storageKey = `videos/${orderId}/${job.id}.mp4`;
    await storage.putFile(storageKey, result.outputFile);
    await db
      .insert(videos)
      .values({
        orderId,
        jobId: job.id,
        variant: "publication",
        storageKey,
        width: result.width,
        height: result.height,
        durationMs: result.durationMs,
      })
      .onConflictDoNothing({ target: videos.jobId });
    await db
      .update(videoJobs)
      .set({ status: "succeeded", updatedAt: new Date() })
      .where(eq(videoJobs.id, job.id));
    const [row] = await db.select().from(videos).where(eq(videos.jobId, job.id));
    if (!row) throw new Error("Veröffentlichungsvideo fehlt");
    return row.id;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function loadTemplate(db: Database) {
  const [template] = await db.select().from(videoTemplates).where(eq(videoTemplates.slug, DEFAULT_TEMPLATE));
  if (!template) throw new Error(`Videovorlage ${DEFAULT_TEMPLATE} fehlt`);
  return template;
}

async function ensureVideoJob(
  db: Database,
  orderId: string,
  templateId: string,
  variant: "customer" | "publication",
  key: string,
) {
  await db
    .insert(videoJobs)
    .values({ orderId, templateId, variant, idempotencyKey: key })
    .onConflictDoNothing({ target: videoJobs.idempotencyKey });
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.idempotencyKey, key));
  if (!job) throw new Error("Videoauftrag fehlt");
  return job;
}

/** Antworten der Bestellung nach Frage-Schlüssel (z. B. deceased_name). */
export async function answersByKey(db: Database, orderId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: questions.key, value: answers.value })
    .from(answers)
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .where(eq(answers.orderId, orderId));
  return Object.fromEntries(rows.map((r) => [r.key, Array.isArray(r.value) ? r.value.join(", ") : r.value]));
}

const germanDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso.trim();
};

/** Texte für das Abschiedsvideo (C11) aus den Antworten des Trauer-Fragebogens. */
export function memorialTextFrom(a: Record<string, string>): MemorialText {
  const name = (a.deceased_name || a.recipient_name || "").trim();
  const born = a.born ? `* ${germanDate(a.born)}` : "";
  const died = a.died ? `† ${germanDate(a.died)}` : "";
  return {
    name,
    dates: [born, died].filter(Boolean).join("   "),
    saying: (a.saying || "In liebevoller Erinnerung").trim(),
    share: `Teile dieses Video, um ${name || "diesen Menschen"} auf eine letzte Reise um die Welt zu schicken.`,
  };
}

/** Erzeugt und prüft eine Videodatei im Arbeitsordner (gemeinsam für Kunden- und Veröffentlichungsfassung). */
async function produceVideo(
  { db, storage, tools, fontFile }: VideoDeps,
  orderId: string,
  jobId: string,
  template: typeof videoTemplates.$inferSelect,
  workDir: string,
  variant: { photos: boolean; title: boolean; testWatermark: boolean },
) {
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, jobId));
  await db
    .update(videoJobs)
    .set({ status: "running", attempt: (job?.attempt ?? 0) + 1, updatedAt: new Date(), error: null })
    .where(eq(videoJobs.id, jobId));

  const [track] = await db
    .select({
      storageKey: musicCandidates.storageKey,
      durationMs: musicCandidates.durationMs,
      lyricsTiming: musicCandidates.lyricsTiming,
    })
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
  const [occasion] = await db
    .select({ videoTemplate: occasions.videoTemplate })
    .from(orders)
    .innerJoin(occasions, eq(orders.occasionId, occasions.id))
    .where(eq(orders.id, orderId));
  const memorial =
    occasion?.videoTemplate === "memorial" ? memorialTextFrom(await answersByKey(db, orderId)) : null;
  if (memorial && !variant.title) memorial.name = "";

  const audio = await storage.open(track.storageKey);
  if (!audio) throw new Error("Songdatei fehlt im Speicher");
  const audioFile = path.join(workDir, "song.mp3");
  await writeFile(audioFile, Buffer.from(await new Response(audio.stream).arrayBuffer()));

  // Fotos des Kunden (falls hochgeladen und erlaubt) für die Slideshow in den Arbeitsordner holen
  const photoFiles: string[] = [];
  if (variant.photos) {
    for (const [i, photo] of (await listPhotos(db, orderId)).entries()) {
      const file = await storage.open(photo.storageKey);
      if (!file) continue;
      const local = path.join(workDir, `foto${i}.jpg`);
      await writeFile(local, Buffer.from(await new Response(file.stream).arrayBuffer()));
      photoFiles.push(local);
    }
  }

  const outputFile = path.join(workDir, "video.mp4");
  const config = template.config as VideoTemplateConfig;
  await renderStandardVideo(tools, {
    workDir,
    audioFile,
    outputFile,
    title: variant.title ? (lyrics?.title ?? "Dein Song") : "",
    durationMs: track.durationMs,
    fontFile: resolveFontFile(fontFile),
    testWatermark: variant.testWatermark,
    config,
    // Songtext läuft mit, wenn der Musikanbieter Zeilenzeiten geliefert hat (abschaltbar per Vorlage)
    lyrics: config.showLyrics === false ? null : track.lyricsTiming,
    photos: photoFiles,
    memorial,
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
      .where(eq(videoJobs.id, jobId));
    throw new VideoCheckFailedError(problems.join("; "));
  }
  return { outputFile, width, height, durationMs: info.durationMs };
}
