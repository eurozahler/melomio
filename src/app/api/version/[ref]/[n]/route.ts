import { getDb } from "@/db/client";
import { listSongVersions } from "@/jobs/versions";
import { getOwnedOrder } from "@/orders/lyrics";
import { fileResponse } from "@/server/files";
import { getSessionUser } from "@/server/session";

/**
 * Zweite Song-Version: beide vollständigen Versionen anhören (nur bezahlt, nur eigenes Konto,
 * nur während der Auswahl). Nach der Auswahl gibt es den Song über die normalen Download-Links.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/version/[ref]/[n]">) {
  const { ref, n } = await params;
  const user = await getSessionUser();
  if (!user?.emailVerified) return new Response("Nicht angemeldet", { status: 401 });
  const db = getDb();
  const order = await getOwnedOrder(db, ref, user.id);
  if (!order?.paidAt || order.status !== "awaiting_choice")
    return new Response("Nicht gefunden", { status: 404 });
  const version = (await listSongVersions(db, order.id)).find((v) => String(v.label) === n);
  if (!version) return new Response("Nicht gefunden", { status: 404 });
  return fileResponse(version.storageKey, {
    contentType: "audio/mpeg",
    filename: `melomio-${order.publicRef}-version-${version.label}.mp3`,
    download: false,
  });
}
