import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  accounts,
  answers,
  auditLogs,
  consents,
  invoices,
  lyricsVersions,
  musicCandidates,
  musicJobs,
  orderStatusHistory,
  orders,
  payments,
  previewClips,
  questionnaireDrafts,
  selectedTracks,
  sessions,
  sharePages,
  users,
  verifications,
  videoJobs,
  videos,
} from "@/db/schema";
import { getSetting } from "@/db/settings-store";
import { canTransition, type OrderStatus } from "@/domain/order-status";
import { transitionOrder } from "@/orders/service";
import type { StorageProvider } from "@/storage";

/**
 * Konto-Rechte nach DSGVO (C4/C8):
 * - Datenexport (Art. 15/20): alle gespeicherten Daten als JSON
 * - Konto löschen (Art. 17): Inhalte und Dateien werden gelöscht, das Konto anonymisiert.
 *   Bestellungen, Zahlungen, Rechnungen und Einwilligungsnachweise bleiben (gesetzliche
 *   Aufbewahrungspflichten) – ohne Inhalte und ohne erkennbare E-Mail im Konto.
 * - Hörproben ohne Kauf werden nach Ablauf gelöscht (Einstellung preview_expiry_days).
 */

/** Während dieser Schritte arbeitet der Worker an der Bestellung – dann nicht löschen. */
const BUSY: OrderStatus[] = ["lyrics_generating", "music_generating", "paid", "video_rendering"];

export class AccountActionError extends Error {
  constructor(public readonly code: "not_found" | "busy") {
    super(code);
    this.name = "AccountActionError";
  }
}

async function contentFiles(db: Database, orderIds: string[]) {
  if (orderIds.length === 0) return [];
  const jobs = db.select({ id: musicJobs.id }).from(musicJobs).where(inArray(musicJobs.orderId, orderIds));
  const [candidates, clips, vids] = await Promise.all([
    db
      .select({ key: musicCandidates.storageKey })
      .from(musicCandidates)
      .where(inArray(musicCandidates.jobId, jobs)),
    db
      .select({ key: previewClips.storageKey })
      .from(previewClips)
      .innerJoin(musicCandidates, eq(previewClips.candidateId, musicCandidates.id))
      .where(inArray(musicCandidates.jobId, jobs)),
    db.select({ key: videos.storageKey }).from(videos).where(inArray(videos.orderId, orderIds)),
  ]);
  return [...candidates, ...clips, ...vids].map((r) => r.key);
}

/** Löscht Song, Hörprobe und Video – und ohne audioOnly auch Songtext und Antworten (Datensatz bleibt). */
async function wipeOrderContent(
  db: Database,
  storage: StorageProvider,
  orderIds: string[],
  { audioOnly = false }: { audioOnly?: boolean } = {},
) {
  if (orderIds.length === 0) return 0;
  const keys = await contentFiles(db, orderIds);
  await db.transaction(async (tx) => {
    await tx.delete(sharePages).where(inArray(sharePages.orderId, orderIds));
    await tx.delete(videos).where(inArray(videos.orderId, orderIds));
    await tx.delete(videoJobs).where(inArray(videoJobs.orderId, orderIds));
    await tx.delete(selectedTracks).where(inArray(selectedTracks.orderId, orderIds));
    await tx.delete(musicJobs).where(inArray(musicJobs.orderId, orderIds)); // samt Kandidaten und Hörproben
    if (audioOnly) return;
    await tx.delete(lyricsVersions).where(inArray(lyricsVersions.orderId, orderIds));
    await tx.delete(answers).where(inArray(answers.orderId, orderIds));
  });
  // Dateien erst nach erfolgreicher Transaktion löschen (eine verwaiste Datei ist harmloser als ein Verweis ins Leere)
  for (const key of keys) await storage.delete(key).catch(() => undefined);
  return keys.length;
}

export async function deleteAccount(db: Database, storage: StorageProvider, userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  if (!user) throw new AccountActionError("not_found");
  const own = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(eq(orders.userId, userId));
  if (own.some((o) => BUSY.includes(o.status))) throw new AccountActionError("busy");

  // Offene Bestellungen abbrechen, damit nichts mehr weiterläuft
  for (const o of own) {
    if (canTransition(o.status, "canceled") && !["completed", "refunded", "canceled"].includes(o.status)) {
      await transitionOrder(db, o.id, "canceled", { actor: userId, reason: "Konto gelöscht" });
    }
  }
  const files = await wipeOrderContent(
    db,
    storage,
    own.map((o) => o.id),
  );

  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    await tx.delete(verifications).where(eq(verifications.identifier, user.email));
    await tx.delete(questionnaireDrafts).where(eq(questionnaireDrafts.userId, userId));
    await tx
      .update(users)
      .set({
        email: `geloescht-${userId}@deleted.invalid`,
        name: "",
        image: null,
        emailVerified: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await tx.insert(auditLogs).values({
      actorUserId: userId,
      action: "account.delete",
      entity: "user",
      entityId: userId,
      newValue: { orders: own.length, files },
    });
  });
  return { orders: own.length, files };
}

/** Alle Daten zum Konto als JSON (Datenexport). Enthält keine Passwörter und keine Dateien. */
export async function exportAccount(db: Database, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new AccountActionError("not_found");
  const own = await db.select().from(orders).where(eq(orders.userId, userId));
  const ids = own.map((o) => o.id);
  const by = <T extends { orderId: string | null }>(rows: T[], id: string) =>
    rows.filter((r) => r.orderId === id);
  const [ans, lyr, hist, pay, inv, cons] = ids.length
    ? await Promise.all([
        db.select().from(answers).where(inArray(answers.orderId, ids)),
        db.select().from(lyricsVersions).where(inArray(lyricsVersions.orderId, ids)),
        db.select().from(orderStatusHistory).where(inArray(orderStatusHistory.orderId, ids)),
        db.select().from(payments).where(inArray(payments.orderId, ids)),
        db.select().from(invoices).where(inArray(invoices.orderId, ids)),
        db.select().from(consents).where(eq(consents.userId, userId)),
      ])
    : [[], [], [], [], [], []];
  return {
    exportedAt: new Date().toISOString(),
    hinweis:
      "Datenexport von melomio. Songs und Videos kannst du auf der jeweiligen Bestellseite herunterladen.",
    konto: { email: user.email, name: user.name, erstelltAm: user.createdAt, sprache: user.locale },
    bestellungen: own.map((o) => ({
      bestellnummer: o.publicRef,
      status: o.status,
      erstelltAm: o.createdAt,
      bezahltAm: o.paidAt,
      antworten: by(ans, o.id).map((a) => ({ frage: a.questionId, antwort: a.value })),
      songtexte: by(lyr, o.id).map((l) => ({
        fassung: l.version,
        titel: l.title,
        inhalt: l.content,
        freigegebenAm: l.approvedAt,
      })),
      verlauf: by(hist, o.id).map((h) => ({ von: h.fromStatus, nach: h.toStatus, am: h.at })),
      zahlungen: by(pay, o.id).map((p) => ({
        anbieter: p.provider,
        status: p.status,
        betragCent: p.amountCents,
        waehrung: p.currency,
        am: p.createdAt,
      })),
      rechnungen: by(inv, o.id).map((i) => ({
        nummer: i.number,
        art: i.kind,
        datum: i.issuedAt,
        bruttoCent: i.grossCents,
      })),
    })),
    einwilligungen: cons.map((c) => ({
      art: c.type,
      fassung: c.textVersion,
      erteiltAm: c.grantedAt,
      widerrufenAm: c.revokedAt ?? null,
    })),
  };
}

/** Hörproben ohne Kauf nach Ablauf löschen (Einstellung preview_expiry_days) → Status „abgelaufen“. */
export async function expireOldPreviews(db: Database, storage: StorageProvider, now = new Date()) {
  const days = await getSetting(db, "preview_expiry_days");
  const cutoff = new Date(now.getTime() - days * 24 * 3600_000);
  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.status, "preview_ready"),
        isNull(orders.paidAt),
        lt(
          sql`(select max(h.at) from ${orderStatusHistory} h where h.order_id = ${orders.id} and h.to_status = 'preview_ready')`,
          cutoff,
        ),
      ),
    );
  let files = 0;
  for (const { id } of stale) {
    await transitionOrder(db, id, "preview_expired", {
      actor: "worker",
      reason: `Hörprobe nach ${days} Tagen ohne Kauf gelöscht`,
    });
    files += await wipeOrderContent(db, storage, [id], { audioOnly: true });
  }
  return { orders: stale.length, files };
}
