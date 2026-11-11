import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { findPreviewClip } from "@/jobs/music";
import { getOwnedOrder } from "@/orders/lyrics";
import { getSessionUser } from "@/server/session";
import { getStorage } from "@/storage";

/** Status, in denen die Hörprobe angehört werden darf. */
const PREVIEW_STATUSES = new Set([
  "preview_ready",
  "awaiting_payment",
  "paid",
  "awaiting_choice",
  "video_rendering",
  "completed",
]);

/**
 * Liefert die 20-Sekunden-Hörprobe aus (E12) – nur an das Konto, dem die Bestellung gehört.
 * Es gibt bewusst KEINE Route für die volle Datei vor der Zahlung (Abnahmekriterium M6).
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/hoerprobe/[ref]">) {
  const { ref } = await params;
  const user = await getSessionUser();
  if (!user?.emailVerified) return new Response("Nicht angemeldet", { status: 401 });

  const db = getDb();
  const order = await getOwnedOrder(db, ref, user.id);
  // Fremde und unbekannte Bestellungen sind nicht unterscheidbar (404)
  if (!order || !PREVIEW_STATUSES.has(order.status)) return new Response("Nicht gefunden", { status: 404 });

  const clip = await findPreviewClip(db, order.id);
  if (!clip) return new Response("Nicht gefunden", { status: 404 });
  const file = await getStorage(getEnv()).open(clip.storageKey);
  if (!file) return new Response("Nicht gefunden", { status: 404 });

  return new Response(file.stream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename="melomio-hoerprobe-${order.publicRef}.mp3"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
