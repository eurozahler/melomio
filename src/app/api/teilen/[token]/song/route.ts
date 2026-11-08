import { getDb } from "@/db/client";
import { findActiveShare, getDeliveryFiles } from "@/orders/delivery";
import { fileResponse } from "@/server/files";

/**
 * Song zum Anhören auf der teilbaren Song-Seite (E17) – ohne Anmeldung, aber nur, solange der
 * Kunde die Seite eingeschaltet hat und die Bestellung bezahlt ist.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/teilen/[token]/song">) {
  const { token } = await params;
  const db = getDb();
  const share = await findActiveShare(db, token);
  if (!share) return new Response("Nicht gefunden", { status: 404 });
  const { song } = await getDeliveryFiles(db, share.order.id);
  if (!song) return new Response("Nicht gefunden", { status: 404 });
  return fileResponse(song.storageKey, {
    contentType: "audio/mpeg",
    filename: "melomio-song.mp3",
    download: false,
  });
}
