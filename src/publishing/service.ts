import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Database } from "@/db/client";
import { auditLogs, consents, occasions, orders, publications, users, videos } from "@/db/schema";
import type { PublicationStatus } from "@/db/schema";
import { enqueue } from "@/jobs/enqueue";
import { QUEUES } from "@/jobs/queues";
import { sendAlert } from "@/monitoring/alerts";
import { listPhotos } from "@/orders/photos";
import type { StorageProvider } from "@/storage";
import { getDefaultFolder, type PublishTarget } from "./target";

/**
 * Veröffentlichung über EasyGMV (C7):
 * 1. Kunde stimmt beim Kauf zu (Fotos ja/nein, Titel ja/nein).
 * 2. Nach dem Kundenvideo: eigene Fassung erzeugen, wenn Fotos oder Titel wegfallen müssen.
 * 3. Admin sieht das Video und gibt frei (jede Veröffentlichung, Pflicht bei Trauer – E15).
 * 4. Upload in den Dropbox-Ordner des Anlasses (sonst Standardordner) – EasyGMV übernimmt.
 * Der Kunde kann jederzeit widerrufen; ist das Video schon hochgeladen, wird es dort gelöscht
 * und der Admin informiert (TikTok-Beitrag ggf. von Hand entfernen).
 */

export class PublicationError extends Error {
  constructor(public readonly code: "not_found" | "wrong_status") {
    super(`Veröffentlichung: ${code}`);
    this.name = "PublicationError";
  }
}

/** Nach dem fertigen Kundenvideo: Veröffentlichung vorbereiten (nur mit Zustimmung). */
export async function startPublication(db: Database, boss: PgBoss, orderId: string): Promise<string> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order?.publication || order.status !== "completed") return "keine Veröffentlichung";
  const [created] = await db
    .insert(publications)
    .values({ orderId })
    .onConflictDoNothing({ target: publications.orderId })
    .returning();
  if (!created) return "Veröffentlichung existiert bereits";

  const hasPhotos = (await listPhotos(db, orderId)).length > 0;
  const needsOwnVersion = (hasPhotos && !order.publication.photos) || !order.publication.title;
  if (needsOwnVersion) {
    await enqueue(boss, QUEUES.publicationRender, { orderId }, { singletonKey: orderId });
    return "eigene Fassung für die Veröffentlichung angestoßen";
  }
  const [customerVideo] = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.orderId, orderId), eq(videos.variant, "customer")))
    .orderBy(desc(videos.createdAt))
    .limit(1);
  if (!customerVideo) throw new Error("Kundenvideo fehlt");
  await markAwaitingApproval(db, created.id, customerVideo.id, order.publicRef);
  return "Veröffentlichung wartet auf Freigabe";
}

export async function markAwaitingApproval(
  db: Database,
  publicationId: string,
  videoId: string,
  ref: string,
) {
  const [updated] = await db
    .update(publications)
    .set({ videoId, status: "awaiting_approval", updatedAt: new Date(), error: null })
    .where(and(eq(publications.id, publicationId), eq(publications.status, "rendering")))
    .returning();
  if (updated) {
    await sendAlert(db, `publication:${publicationId}`, `Veröffentlichung ${ref} wartet auf Freigabe`, [
      "Ein Kunde hat der Veröffentlichung zugestimmt.",
      "Bitte im Admin unter „Veröffentlichungen“ ansehen und freigeben oder ablehnen.",
    ]);
  }
}

export async function getPublicationByOrder(db: Database, orderId: string) {
  const [row] = await db.select().from(publications).where(eq(publications.orderId, orderId));
  return row ?? null;
}

async function audit(db: Database, actorUserId: string, action: string, id: string, newValue?: unknown) {
  await db.insert(auditLogs).values({ actorUserId, action, entity: "publication", entityId: id, newValue });
}

/** Admin gibt frei → Upload in den Ordner des Anlasses (oder den Standardordner). */
export async function approvePublication(db: Database, boss: PgBoss, id: string, actorUserId: string) {
  const [row] = await db
    .select({ pub: publications, folder: occasions.publicationFolder })
    .from(publications)
    .innerJoin(orders, eq(publications.orderId, orders.id))
    .innerJoin(occasions, eq(orders.occasionId, occasions.id))
    .where(eq(publications.id, id));
  if (!row) throw new PublicationError("not_found");
  if (row.pub.status !== "awaiting_approval") throw new PublicationError("wrong_status");
  const targetFolder = row.folder || (await getDefaultFolder(db));
  await db.transaction(async (tx) => {
    await tx
      .update(publications)
      .set({
        status: "approved",
        decidedBy: actorUserId,
        decidedAt: new Date(),
        targetFolder,
        updatedAt: new Date(),
      })
      .where(eq(publications.id, id));
    await enqueue(boss, QUEUES.publicationUpload, { orderId: row.pub.orderId }, { tx, singletonKey: id });
  });
  await audit(db, actorUserId, "publication.approve", id, { targetFolder });
}

export async function rejectPublication(db: Database, id: string, actorUserId: string, note: string) {
  const [updated] = await db
    .update(publications)
    .set({ status: "rejected", decidedBy: actorUserId, decidedAt: new Date(), note, updatedAt: new Date() })
    .where(and(eq(publications.id, id), inArray(publications.status, ["awaiting_approval", "failed"])))
    .returning();
  if (!updated) throw new PublicationError("wrong_status");
  await audit(db, actorUserId, "publication.reject", id, { note });
}

/** Upload (Worker). Dateiname: Datum + Bestellnummer – keine Namen. */
export async function uploadPublication(
  deps: { db: Database; storage: StorageProvider; target: PublishTarget },
  orderId: string,
): Promise<string> {
  const { db, storage, target } = deps;
  const [row] = await db
    .select({ pub: publications, video: videos, ref: orders.publicRef })
    .from(publications)
    .innerJoin(orders, eq(publications.orderId, orders.id))
    .leftJoin(videos, eq(publications.videoId, videos.id))
    .where(eq(publications.orderId, orderId));
  if (!row) return "keine Veröffentlichung";
  if (row.pub.status !== "approved") return `übersprungen (Status ${row.pub.status})`;
  if (!row.video) throw new Error("Video für die Veröffentlichung fehlt");
  const file = await storage.open(row.video.storageKey);
  if (!file) throw new Error("Videodatei fehlt im Speicher");

  const workDir = await mkdtemp(path.join(tmpdir(), "melomio-publish-"));
  try {
    const local = path.join(workDir, "video.mp4");
    await writeFile(local, Buffer.from(await new Response(file.stream).arrayBuffer()));
    const day = new Date().toISOString().slice(0, 10);
    const remotePath = await target.upload(
      local,
      row.pub.targetFolder ?? "/melomio",
      `${day}-${row.ref}.mp4`,
    );
    // Hat der Kunde in der Zwischenzeit widerrufen? Dann sofort wieder entfernen
    const [now] = await db
      .update(publications)
      .set({ status: "uploaded", remotePath, uploadedAt: new Date(), updatedAt: new Date(), error: null })
      .where(and(eq(publications.id, row.pub.id), eq(publications.status, "approved")))
      .returning();
    if (!now) {
      await target.remove(remotePath);
      return "nach Widerruf wieder entfernt";
    }
    return `hochgeladen (${target.name}): ${remotePath}`;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function markPublicationFailed(db: Database, orderId: string, error: string) {
  const [row] = await db
    .update(publications)
    .set({ status: "failed", error: error.slice(0, 1000), updatedAt: new Date() })
    .where(and(eq(publications.orderId, orderId), inArray(publications.status, ["rendering", "approved"])))
    .returning();
  if (row) {
    await sendAlert(db, `publication-failed:${row.id}`, "Veröffentlichung fehlgeschlagen", [
      error.slice(0, 500),
      "Im Admin unter „Veröffentlichungen“ erneut versuchen oder ablehnen.",
    ]);
  }
}

/** Admin: fehlgeschlagene Veröffentlichung erneut versuchen. */
export async function retryPublication(db: Database, boss: PgBoss, id: string, actorUserId: string) {
  const [pub] = await db.select().from(publications).where(eq(publications.id, id));
  if (!pub) throw new PublicationError("not_found");
  if (pub.status !== "failed") throw new PublicationError("wrong_status");
  const next: PublicationStatus = pub.videoId
    ? pub.decidedAt
      ? "approved"
      : "awaiting_approval"
    : "rendering";
  await db
    .update(publications)
    .set({ status: next, error: null, updatedAt: new Date() })
    .where(eq(publications.id, id));
  if (next === "approved") {
    await enqueue(
      boss,
      QUEUES.publicationUpload,
      { orderId: pub.orderId },
      { singletonKey: `${id}:${Date.now()}` },
    );
  } else if (next === "rendering") {
    await enqueue(
      boss,
      QUEUES.publicationRender,
      { orderId: pub.orderId },
      { singletonKey: `${pub.orderId}:${Date.now()}` },
    );
  }
  await audit(db, actorUserId, "publication.retry", id);
}

/**
 * Widerruf durch den Kunden (oder bei Erstattung durch das System): keine weitere Veröffentlichung,
 * Einwilligungen als widerrufen markieren, hochgeladene Datei löschen, Admin informieren.
 */
export async function withdrawPublication(
  db: Database,
  target: PublishTarget,
  orderId: string,
  actor: string,
): Promise<boolean> {
  const [pub] = await db.select().from(publications).where(eq(publications.orderId, orderId));
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new PublicationError("not_found");
  const now = new Date();
  await db.update(orders).set({ publication: null }).where(eq(orders.id, orderId));
  await db
    .update(consents)
    .set({ revokedAt: now })
    .where(
      and(
        eq(consents.orderId, orderId),
        inArray(consents.type, ["publication", "publication_photos", "publication_memorial"]),
        isNull(consents.revokedAt),
      ),
    );
  if (!pub || pub.status === "withdrawn" || pub.status === "rejected") return false;
  await db
    .update(publications)
    .set({ status: "withdrawn", withdrawnAt: now, updatedAt: now })
    .where(eq(publications.id, pub.id));
  let removed = "";
  if (pub.status === "uploaded" && pub.remotePath) {
    try {
      await target.remove(pub.remotePath);
      removed = "Die Datei wurde aus dem Ordner gelöscht.";
    } catch (e) {
      removed = `Die Datei konnte NICHT gelöscht werden (${e instanceof Error ? e.message : e}) – bitte von Hand entfernen: ${pub.remotePath}`;
    }
    await sendAlert(db, `publication-withdrawn:${pub.id}`, `Veröffentlichung ${order.publicRef} widerrufen`, [
      "Der Kunde hat die Zustimmung zur Veröffentlichung widerrufen.",
      removed,
      "Falls das Video schon auf TikTok o. ä. veröffentlicht wurde: bitte dort entfernen.",
    ]);
  }
  await db.insert(auditLogs).values({
    actorUserId: actor === "system" ? null : actor,
    action: "publication.withdraw",
    entity: "publication",
    entityId: pub.id,
    newValue: { by: actor },
  });
  return true;
}

export type AdminPublicationRow = Awaited<ReturnType<typeof listPublications>>[number];

export async function listPublications(db: Database, statuses?: PublicationStatus[]) {
  return db
    .select({
      pub: publications,
      ref: orders.publicRef,
      isTest: orders.isTest,
      choice: orders.publication,
      occasion: occasions.name,
      folder: occasions.publicationFolder,
      template: occasions.videoTemplate,
      email: users.email,
    })
    .from(publications)
    .innerJoin(orders, eq(publications.orderId, orders.id))
    .innerJoin(occasions, eq(orders.occasionId, occasions.id))
    .innerJoin(users, eq(orders.userId, users.id))
    .where(statuses ? inArray(publications.status, statuses) : undefined)
    .orderBy(desc(publications.createdAt))
    .limit(100);
}
