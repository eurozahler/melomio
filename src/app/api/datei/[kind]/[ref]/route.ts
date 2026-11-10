import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { verifySignedFile, type FileKind } from "@/delivery/signing";
import { getDeliveryFiles } from "@/orders/delivery";
import { getOwnedOrder } from "@/orders/lyrics";
import { fileResponse } from "@/server/files";
import { getSessionUser } from "@/server/session";

/**
 * Download von Song (MP3) und Video (MP4) – Abnahme M9:
 * - nur mit gültiger, nicht abgelaufener Signatur
 * - nur angemeldet und nur für die eigene, bezahlte Bestellung
 * Fremde Bestellungen sind von unbekannten nicht unterscheidbar (404).
 */
export async function GET(request: Request, { params }: RouteContext<"/api/datei/[kind]/[ref]">) {
  const { kind, ref } = await params;
  if (kind !== "song" && kind !== "video") return new Response("Nicht gefunden", { status: 404 });

  const url = new URL(request.url);
  const check = verifySignedFile(
    getEnv().BETTER_AUTH_SECRET,
    kind as FileKind,
    ref,
    url.searchParams.get("exp"),
    url.searchParams.get("sig"),
  );
  if (check === "expired") return new Response("Link abgelaufen – bitte Seite neu laden", { status: 410 });
  if (check !== "ok") return new Response("Ungültiger Link", { status: 403 });

  const user = await getSessionUser();
  if (!user?.emailVerified) return new Response("Nicht angemeldet", { status: 401 });

  const db = getDb();
  const order = await getOwnedOrder(db, ref, user.id);
  // Nach einer Erstattung keine Downloads mehr
  if (!order?.paidAt || order.status === "refunded") return new Response("Nicht gefunden", { status: 404 });

  const files = await getDeliveryFiles(db, order.id);
  const file = kind === "song" ? files.song : files.video;
  if (!file) return new Response("Nicht gefunden", { status: 404 });

  const download = url.searchParams.get("download") === "1";
  return fileResponse(file.storageKey, {
    contentType: kind === "song" ? "audio/mpeg" : "video/mp4",
    filename: `melomio-${order.publicRef}.${kind === "song" ? "mp3" : "mp4"}`,
    download,
  });
}
