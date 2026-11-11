import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, asc, count, eq } from "drizzle-orm";
import sharp from "sharp";
import type { Database } from "@/db/client";
import { orderPhotos, orders } from "@/db/schema";
import type { StorageProvider } from "@/storage";

/**
 * Fotos für das Video (C2):
 * - nur Bilder (JPEG, PNG, WebP), höchstens 15 MB je Datei, höchstens MAX_PHOTOS je Bestellung
 * - jedes Bild wird neu berechnet: gedreht laut Kamera-Angabe, verkleinert (max. 1920 px),
 *   als JPEG gespeichert – dabei fallen alle Metadaten weg (EXIF, GPS-Standort, Kameradaten)
 *   und eingeschleuste Inhalte in der Datei werden nicht übernommen
 * - änderbar bis zum Kauf; danach entsteht das Video mit diesen Fotos
 */

export const MAX_PHOTOS = 10;
export const MAX_BYTES = 15 * 1024 * 1024;
const EDITABLE = [
  "lyrics_review",
  "lyrics_approved",
  "music_generating",
  "preview_ready",
  "awaiting_payment",
];

export class PhotoError extends Error {
  constructor(public readonly code: "not_found" | "locked" | "too_many" | "too_large" | "not_image") {
    super(code);
    this.name = "PhotoError";
  }
}

async function ownedEditableOrder(db: Database, publicRef: string, userId: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.publicRef, publicRef), eq(orders.userId, userId)));
  if (!order) throw new PhotoError("not_found");
  if (!EDITABLE.includes(order.status)) throw new PhotoError("locked");
  return order;
}

/** Prüft und bereinigt ein hochgeladenes Bild; liefert das neue JPEG. */
export async function sanitizeImage(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  if (input.length > MAX_BYTES) throw new PhotoError("too_large");
  let meta;
  try {
    meta = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw new PhotoError("not_image");
  }
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) throw new PhotoError("not_image");
  const { data, info } = await sharp(input, { failOn: "error" })
    .rotate() // nach Kamera-Ausrichtung drehen, bevor die Metadaten wegfallen
    .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function addPhoto(
  db: Database,
  storage: StorageProvider,
  publicRef: string,
  userId: string,
  file: Buffer,
) {
  const order = await ownedEditableOrder(db, publicRef, userId);
  const [existing] = await db
    .select({ n: count() })
    .from(orderPhotos)
    .where(eq(orderPhotos.orderId, order.id));
  if ((existing?.n ?? 0) >= MAX_PHOTOS) throw new PhotoError("too_many");
  const clean = await sanitizeImage(file);
  const id = randomUUID();
  const storageKey = `photos/${order.id}/${id}.jpg`;
  const dir = await mkdtemp(path.join(tmpdir(), "melomio-photo-"));
  try {
    const tmp = path.join(dir, "p.jpg");
    await writeFile(tmp, clean.data);
    await storage.putFile(storageKey, tmp);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const [row] = await db
    .insert(orderPhotos)
    .values({
      id,
      orderId: order.id,
      storageKey,
      width: clean.width,
      height: clean.height,
      sort: existing?.n ?? 0,
    })
    .returning();
  return row!;
}

export async function removePhoto(
  db: Database,
  storage: StorageProvider,
  publicRef: string,
  userId: string,
  photoId: string,
) {
  const order = await ownedEditableOrder(db, publicRef, userId);
  const [photo] = await db
    .select()
    .from(orderPhotos)
    .where(and(eq(orderPhotos.id, photoId), eq(orderPhotos.orderId, order.id)));
  if (!photo) throw new PhotoError("not_found");
  await db.delete(orderPhotos).where(eq(orderPhotos.id, photo.id));
  await storage.delete(photo.storageKey).catch(() => undefined);
}

export async function listPhotos(db: Database, orderId: string) {
  return db
    .select()
    .from(orderPhotos)
    .where(eq(orderPhotos.orderId, orderId))
    .orderBy(asc(orderPhotos.sort), asc(orderPhotos.createdAt));
}
