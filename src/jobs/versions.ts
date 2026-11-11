import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Database } from "@/db/client";
import { musicCandidates, musicJobs, orderStatusHistory, orders } from "@/db/schema";
import { getSetting } from "@/db/settings-store";
import { transitionOrder } from "@/orders/service";
import { enqueue } from "./enqueue";
import { buildMusicInput, generateCandidate, type MusicDeps } from "./music";
import { QUEUES } from "./queues";
import { findPreviewCandidateId, startVideo } from "./video";

/**
 * Zweite Song-Version nach dem Kauf (E4): Nach der Zahlung entsteht eine zweite, anders klingende
 * Version desselben Songtexts. Der Kunde hört beide und wählt seinen Favoriten; danach entsteht
 * das Video. Wählt er nicht innerhalb der Frist, gilt die Version der Hörprobe.
 *
 * Klappt die zweite Version nicht (Anbieterfehler, Prüfung nicht bestanden), wird der Kunde nicht
 * aufgehalten: Das Video entsteht sofort mit der Version der Hörprobe.
 */

/** Nach Rechnung und Bestätigung: zweite Version anstoßen – oder direkt das Video, wenn abgeschaltet. */
export async function startAfterPayment(db: Database, boss: PgBoss, orderId: string): Promise<string> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  if (order.status !== "paid") return `übersprungen (Status ${order.status})`;
  if ((await getSetting(db, "music_extra_candidates_after_purchase")) < 1) {
    return startVideo(db, boss, orderId);
  }
  await enqueue(boss, QUEUES.musicExtra, { orderId }, { singletonKey: orderId });
  return "zweite Version angestoßen";
}

export type ExtraVersionDeps = MusicDeps & { boss: PgBoss };

/** Erzeugt die zweite Version. Ergebnis: Status „Version wählen“ – oder sofort Video (Ausweichweg). */
export async function runExtraVersion(deps: ExtraVersionDeps, orderId: string): Promise<string> {
  const { db, boss } = deps;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  if (order.status !== "paid") return `übersprungen (Status ${order.status})`;

  const key = `music:${orderId}:post_purchase`;
  await db
    .insert(musicJobs)
    .values({ orderId, phase: "post_purchase", provider: deps.music.name, idempotencyKey: key })
    .onConflictDoNothing({ target: musicJobs.idempotencyKey });
  const [job] = await db.select().from(musicJobs).where(eq(musicJobs.idempotencyKey, key));
  if (!job) throw new Error("Musikauftrag fehlt");

  // Schon ein geprüfter Kandidat da (z. B. Absturz nach dem Speichern)? Dann keinen neuen bezahlen
  const [ready] = await db
    .select()
    .from(musicCandidates)
    .where(and(eq(musicCandidates.jobId, job.id), eq(musicCandidates.qcStatus, "passed")));

  let problem: string | null = null;
  if (!ready) {
    await db
      .update(musicJobs)
      .set({ status: "running", attempt: job.attempt + 1, updatedAt: new Date(), error: null })
      .where(eq(musicJobs.id, job.id));
    const workDir = await mkdtemp(path.join(tmpdir(), "melomio-version-"));
    try {
      const { qc } = await generateCandidate(deps, {
        jobId: job.id,
        orderId,
        input: await buildMusicInput(db, orderId),
        workDir,
        targetDurationS: await getSetting(db, "song_target_duration_s"),
        countPreviewUsage: false,
      });
      if (qc.status !== "passed") problem = `Prüfung: ${qc.reasons.join("; ") || qc.status}`;
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  if (problem) {
    await db
      .update(musicJobs)
      .set({ status: "failed", error: problem.slice(0, 1000), updatedAt: new Date() })
      .where(eq(musicJobs.id, job.id));
    const started = await startVideo(db, boss, orderId, {
      reason: "Zweite Version nicht möglich – Video mit der Version der Hörprobe",
    });
    return `zweite Version fehlgeschlagen (${problem.slice(0, 120)}) → ${started}`;
  }

  await db
    .update(musicJobs)
    .set({ status: "succeeded", updatedAt: new Date() })
    .where(eq(musicJobs.id, job.id));
  await transitionOrder(db, orderId, "awaiting_choice", {
    actor: "worker",
    reason: "Zweite Version fertig – Kunde wählt",
  });
  return "zweite Version fertig – Kunde wählt";
}

export type SongVersion = { candidateId: string; storageKey: string; durationMs: number; label: 1 | 2 };

/** Die beiden Versionen zur Auswahl: 1 = Hörproben-Version, 2 = nach dem Kauf erzeugt. */
export async function listSongVersions(db: Database, orderId: string): Promise<SongVersion[]> {
  const previewId = await findPreviewCandidateId(db, orderId);
  const rows = await db
    .select({
      candidateId: musicCandidates.id,
      storageKey: musicCandidates.storageKey,
      durationMs: musicCandidates.durationMs,
      phase: musicJobs.phase,
    })
    .from(musicCandidates)
    .innerJoin(musicJobs, eq(musicCandidates.jobId, musicJobs.id))
    .where(and(eq(musicJobs.orderId, orderId), eq(musicCandidates.qcStatus, "passed")))
    .orderBy(asc(musicCandidates.createdAt));
  const first = rows.find((r) => r.candidateId === previewId);
  const second = rows.find((r) => r.phase === "post_purchase");
  return [
    ...(first ? [{ ...first, label: 1 as const }] : []),
    ...(second ? [{ ...second, label: 2 as const }] : []),
  ].map(({ candidateId, storageKey, durationMs, label }) => ({ candidateId, storageKey, durationMs, label }));
}

export class VersionChoiceError extends Error {
  constructor(public readonly code: "not_found" | "wrong_status" | "unknown_version") {
    super(`Auswahl abgelehnt: ${code}`);
    this.name = "VersionChoiceError";
  }
}

/** Kunde wählt seine Version → Video startet. */
export async function chooseVersion(
  db: Database,
  boss: PgBoss,
  input: { publicRef: string; userId: string; candidateId: string },
): Promise<void> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.publicRef, input.publicRef), eq(orders.userId, input.userId)));
  if (!order) throw new VersionChoiceError("not_found");
  if (order.status !== "awaiting_choice") throw new VersionChoiceError("wrong_status");
  const versions = await listSongVersions(db, order.id);
  const chosen = versions.find((v) => v.candidateId === input.candidateId);
  if (!chosen) throw new VersionChoiceError("unknown_version");
  await startVideo(db, boss, order.id, {
    candidateId: chosen.candidateId,
    selectedBy: "customer",
    actor: input.userId,
    reason: `Kunde wählt Version ${chosen.label}`,
  });
}

/** Täglich: Wer nach Ablauf der Frist nicht gewählt hat, bekommt die Version der Hörprobe. */
export async function autoChooseExpired(db: Database, boss: PgBoss, now = new Date()): Promise<number> {
  const days = await getSetting(db, "version_choice_days");
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const waiting = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.status, "awaiting_choice"),
        inArray(
          orders.id,
          db
            .select({ id: orderStatusHistory.orderId })
            .from(orderStatusHistory)
            .where(
              and(eq(orderStatusHistory.toStatus, "awaiting_choice"), lt(orderStatusHistory.at, cutoff)),
            ),
        ),
      ),
    );
  for (const { id } of waiting) {
    await startVideo(db, boss, id, { reason: `Keine Auswahl nach ${days} Tagen – Version der Hörprobe` });
  }
  return waiting.length;
}
