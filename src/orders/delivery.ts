import { randomBytes } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { lyricsVersions, musicCandidates, orders, selectedTracks, sharePages, videos } from "@/db/schema";

/**
 * Auslieferung (Modul M9): Song und Video der Bestellung, teilbare Song-Seite.
 * Dateien gibt es erst nach bestätigter Zahlung (E12) – das prüfen die Routen zusätzlich.
 */

export async function getDeliveryFiles(db: Database, orderId: string) {
  const [song] = await db
    .select({ storageKey: musicCandidates.storageKey, durationMs: musicCandidates.durationMs })
    .from(selectedTracks)
    .innerJoin(musicCandidates, eq(selectedTracks.candidateId, musicCandidates.id))
    .where(eq(selectedTracks.orderId, orderId));
  const [video] = await db
    .select({ storageKey: videos.storageKey, durationMs: videos.durationMs })
    .from(videos)
    .where(and(eq(videos.orderId, orderId), eq(videos.variant, "customer")))
    .orderBy(desc(videos.createdAt))
    .limit(1);
  return { song: song ?? null, video: video ?? null };
}

export async function getApprovedLyrics(db: Database, orderId: string) {
  const [row] = await db
    .select()
    .from(lyricsVersions)
    .where(and(eq(lyricsVersions.orderId, orderId), isNotNull(lyricsVersions.approvedAt)))
    .orderBy(desc(lyricsVersions.version))
    .limit(1);
  return row ? { title: row.title, sections: row.content.sections } : null;
}

/** Song-Seite der Bestellung (aktiv oder abgeschaltet), oder null. */
export async function getSharePage(db: Database, orderId: string) {
  const [row] = await db.select().from(sharePages).where(eq(sharePages.orderId, orderId));
  return row ?? null;
}

/** Song-Seite einschalten (Kunde). Nur für bezahlte Bestellungen des eigenen Kontos. */
export async function enableSharePage(db: Database, publicRef: string, userId: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.publicRef, publicRef), eq(orders.userId, userId)));
  if (!order?.paidAt) return null;
  const token = randomBytes(24).toString("base64url"); // 32 Zeichen, nicht zu erraten
  const [row] = await db
    .insert(sharePages)
    .values({ orderId: order.id, token })
    .onConflictDoUpdate({
      target: sharePages.orderId,
      // Beim erneuten Einschalten gibt es einen NEUEN Link – der alte bleibt tot
      set: { token, active: true, disabledAt: null, createdAt: new Date() },
    })
    .returning();
  return row ?? null;
}

export async function disableSharePage(db: Database, publicRef: string, userId: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.publicRef, publicRef), eq(orders.userId, userId)));
  if (!order) return false;
  await db
    .update(sharePages)
    .set({ active: false, disabledAt: new Date() })
    .where(eq(sharePages.orderId, order.id));
  return true;
}

/** Öffentliche Song-Seite über den Link – nur aktiv und nur für bezahlte Bestellungen. */
export async function findActiveShare(db: Database, token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db
    .select({ order: orders, share: sharePages })
    .from(sharePages)
    .innerJoin(orders, eq(sharePages.orderId, orders.id))
    .where(and(eq(sharePages.token, token), eq(sharePages.active, true)));
  if (!row?.order.paidAt) return null;
  return row;
}
