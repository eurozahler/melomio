import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { orders } from "@/db/schema";
import { findPreviewClip } from "@/jobs/music";
import { getDeliveryFiles } from "@/orders/delivery";
import { getAdminUser } from "@/server/admin";
import { fileResponse } from "@/server/files";

/** Hörprobe und Kundenvideo für den Admin (Bestelldetail). Ohne Admin-Rolle: 404. */
export async function GET(_request: Request, { params }: RouteContext<"/api/admin/datei/[kind]/[ref]">) {
  const { kind, ref } = await params;
  if (!(await getAdminUser()) || (kind !== "hoerprobe" && kind !== "video"))
    return new Response("Nicht gefunden", { status: 404 });
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.publicRef, ref));
  if (!order) return new Response("Nicht gefunden", { status: 404 });
  if (kind === "hoerprobe") {
    const clip = await findPreviewClip(db, order.id);
    if (!clip) return new Response("Nicht gefunden", { status: 404 });
    return fileResponse(clip.storageKey, {
      contentType: "audio/mpeg",
      filename: `hoerprobe-${ref}.mp3`,
      download: false,
    });
  }
  const { video } = await getDeliveryFiles(db, order.id);
  if (!video) return new Response("Nicht gefunden", { status: 404 });
  return fileResponse(video.storageKey, {
    contentType: "video/mp4",
    filename: `video-${ref}.mp4`,
    download: false,
  });
}
