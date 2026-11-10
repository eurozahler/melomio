import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  genres,
  lyricsVersions,
  moods,
  musicCandidates,
  musicJobs,
  orders,
  previewClips,
  previewUsage,
  voices,
} from "@/db/schema";
import { getSetting } from "@/db/settings-store";
import { lyricsSchema } from "@/lyrics/types";
import { cutPreview, detectSilence, probeAudio, type MediaTools } from "@/media/ffmpeg";
import { choosePreviewStart } from "@/music/preview";
import { evaluateQuality } from "@/music/qc";
import type { MusicInput, MusicProvider } from "@/music/types";
import { transitionOrder } from "@/orders/service";
import type { StorageProvider } from "@/storage";

/**
 * Musik-Schritt vor der Zahlung (Modul M6, E12):
 * 1. Kandidaten erzeugen (Anzahl aus den Einstellungen, Standard 1)
 * 2. technisch prüfen (lesbar, Dauer, Stille)
 * 3. volle Datei geschützt speichern – sie verlässt den Server erst nach der Zahlung
 * 4. 20-Sekunden-Hörprobe mit Wasserzeichen schneiden → „Hörprobe bereit“
 * Bei einer Wiederholung werden bereits fertige, geprüfte Kandidaten wiederverwendet
 * (keine doppelten Kosten beim Musikanbieter).
 */

export type MusicDeps = { db: Database; music: MusicProvider; storage: StorageProvider; tools: MediaTools };

export class QualityCheckFailedError extends Error {
  constructor(reasons: string[]) {
    super(`Qualitätsprüfung nicht bestanden: ${reasons.join("; ")}`);
    this.name = "QualityCheckFailedError";
  }
}

async function buildMusicInput(db: Database, orderId: string): Promise<MusicInput> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  const [approved] = await db
    .select()
    .from(lyricsVersions)
    .where(and(eq(lyricsVersions.orderId, orderId), isNotNull(lyricsVersions.approvedAt)))
    .orderBy(desc(lyricsVersions.version))
    .limit(1);
  if (!approved) throw new Error("Kein freigegebener Songtext vorhanden");
  const hint = async (table: typeof genres | typeof moods | typeof voices, id: string | null) => {
    if (!id) return null;
    const [row] = await db.select({ h: table.promptHint }).from(table).where(eq(table.id, id));
    return row?.h ?? null;
  };
  return {
    lyrics: lyricsSchema.parse({ title: approved.title, sections: approved.content.sections }),
    genreHint: await hint(genres, order.genreId),
    moodHint: await hint(moods, order.moodId),
    voiceHint: await hint(voices, order.voiceId),
    language: "de",
    targetDurationS: await getSetting(db, "song_target_duration_s"),
  };
}

/** Führt den Musik-Schritt aus. Gibt eine kurze Beschreibung des Ergebnisses zurück. */
export async function runPreviewMusic(
  { db, music, storage, tools }: MusicDeps,
  orderId: string,
): Promise<string> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  if (order.status === "lyrics_approved") {
    await transitionOrder(db, orderId, "music_generating", {
      actor: "worker",
      reason: "Hörprobe wird erstellt",
    });
  } else if (order.status !== "music_generating") {
    return `übersprungen (Status ${order.status})`;
  }

  // Musikauftrag (einer pro Bestellung und Phase)
  const key = `music:${orderId}:preview`;
  await db
    .insert(musicJobs)
    .values({ orderId, phase: "preview", provider: music.name, idempotencyKey: key })
    .onConflictDoNothing({ target: musicJobs.idempotencyKey });
  const [job] = await db.select().from(musicJobs).where(eq(musicJobs.idempotencyKey, key));
  if (!job) throw new Error("Musikauftrag fehlt");
  await db
    .update(musicJobs)
    .set({ status: "running", attempt: job.attempt + 1, updatedAt: new Date(), error: null })
    .where(eq(musicJobs.id, job.id));

  const [wanted, targetDurationS, previewS, fallbackPct] = await Promise.all([
    getSetting(db, "music_candidates_before_purchase"),
    getSetting(db, "song_target_duration_s"),
    getSetting(db, "preview_duration_s"),
    getSetting(db, "preview_start_fallback_pct"),
  ]);

  const workDir = await mkdtemp(path.join(tmpdir(), "melomio-music-"));
  try {
    const existing = await db.select().from(musicCandidates).where(eq(musicCandidates.jobId, job.id));
    const passed = existing.filter((c) => c.qcStatus === "passed");
    const manual = existing.filter((c) => c.qcStatus === "manual");
    const reasons: string[] = [];

    if (passed.length === 0) {
      const input = await buildMusicInput(db, orderId);
      for (let i = 0; i < wanted && passed.length === 0; i++) {
        const result = await music.generate(input, workDir);
        // Kosten festhalten (Dashboard, Tagesbudget) – je erzeugtem Kandidaten
        const cost = music.estimateCostCents(input);
        if (cost > 0) {
          await db
            .update(musicJobs)
            .set({ costEstimateCents: sql`coalesce(${musicJobs.costEstimateCents}, 0) + ${cost}` })
            .where(eq(musicJobs.id, job.id));
          await db
            .update(previewUsage)
            .set({ costEstimateCents: sql`coalesce(${previewUsage.costEstimateCents}, 0) + ${cost}` })
            .where(eq(previewUsage.orderId, orderId));
        }
        let probe: Awaited<ReturnType<typeof probeAudio>> | null = null;
        try {
          probe = await probeAudio(tools, result.file);
        } catch {
          probe = null;
        }
        const silences = probe ? await detectSilence(tools, result.file) : [];
        const qc = evaluateQuality({
          decodable: probe !== null,
          durationMs: probe?.durationMs ?? 0,
          silences,
          targetDurationS,
        });
        const candidateId = randomUUID();
        const storageKey = `songs/${orderId}/${candidateId}.mp3`;
        await storage.putFile(storageKey, result.file);
        const [row] = await db
          .insert(musicCandidates)
          .values({
            id: candidateId,
            jobId: job.id,
            storageKey,
            durationMs: probe?.durationMs ?? 0,
            format: result.format,
            qcStatus: qc.status,
            qcResult: {
              reasons: qc.reasons,
              silences: silences.map((s) => ({ ...s, endMs: Number.isFinite(s.endMs) ? s.endMs : null })),
              model: result.model,
            },
            sections: result.sections,
          })
          .returning();
        if (!row) throw new Error("Kandidat konnte nicht gespeichert werden");
        if (qc.status === "passed") passed.push(row);
        else if (qc.status === "manual") manual.push(row);
        reasons.push(...qc.reasons);
      }
    }

    const chosen = passed[0];
    if (!chosen) {
      if (manual.length > 0) {
        await db
          .update(musicJobs)
          .set({ status: "succeeded", updatedAt: new Date() })
          .where(eq(musicJobs.id, job.id));
        await transitionOrder(db, orderId, "manual_review", {
          actor: "worker",
          reason: `Qualitätsprüfung unsicher: ${reasons.join("; ") || "siehe Kandidat"}`.slice(0, 500),
        });
        return "zur manuellen Prüfung";
      }
      await db
        .update(musicJobs)
        .set({ status: "failed", error: reasons.join("; ").slice(0, 1000), updatedAt: new Date() })
        .where(eq(musicJobs.id, job.id));
      throw new QualityCheckFailedError(reasons);
    }

    // Hörprobe (nur sie wird vor der Zahlung ausgeliefert)
    const [clip] = await db.select().from(previewClips).where(eq(previewClips.candidateId, chosen.id));
    if (!clip) {
      const opened = await storage.open(chosen.storageKey);
      if (!opened) throw new Error("Gespeicherte Datei fehlt");
      const fullFile = path.join(workDir, "full.mp3");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(fullFile, Buffer.from(await new Response(opened.stream).arrayBuffer()));
      const start = choosePreviewStart({
        durationMs: chosen.durationMs,
        previewMs: previewS * 1000,
        sections: chosen.sections,
        fallbackPct,
      });
      const previewFile = path.join(workDir, "preview.mp3");
      const durationMs = Math.min(previewS * 1000, chosen.durationMs);
      await cutPreview(tools, fullFile, previewFile, { startMs: start.startMs, durationMs });
      const previewKey = `previews/${orderId}/${chosen.id}.mp3`;
      await storage.putFile(previewKey, previewFile);
      await db
        .insert(previewClips)
        .values({
          candidateId: chosen.id,
          storageKey: previewKey,
          startMs: start.startMs,
          durationMs,
          startMethod: start.method,
        })
        .onConflictDoNothing({ target: previewClips.candidateId });
    }

    await db
      .update(musicJobs)
      .set({ status: "succeeded", updatedAt: new Date() })
      .where(eq(musicJobs.id, job.id));
    await transitionOrder(db, orderId, "preview_ready", {
      actor: "worker",
      reason: `Hörprobe aus Kandidat ${chosen.id.slice(0, 8)}`,
    });
    return `Hörprobe bereit (${music.name})`;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** Hörprobe einer Bestellung (für die Auslieferung) – nur die 20-Sekunden-Datei, nie die volle. */
export async function findPreviewClip(db: Database, orderId: string) {
  const [row] = await db
    .select({ storageKey: previewClips.storageKey, durationMs: previewClips.durationMs })
    .from(previewClips)
    .innerJoin(musicCandidates, eq(previewClips.candidateId, musicCandidates.id))
    .innerJoin(musicJobs, eq(musicCandidates.jobId, musicJobs.id))
    .where(and(eq(musicJobs.orderId, orderId), eq(musicJobs.phase, "preview")))
    .orderBy(desc(previewClips.createdAt))
    .limit(1);
  return row ?? null;
}
