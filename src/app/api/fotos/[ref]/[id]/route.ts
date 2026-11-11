import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { orderPhotos } from "@/db/schema";
import { getOwnedOrder } from "@/orders/lyrics";
import { fileResponse } from "@/server/files";
import { getSessionUser } from "@/server/session";

/** Hochgeladenes Foto anzeigen – nur für das Konto, dem die Bestellung gehört. */
export async function GET(_request: Request, { params }: RouteContext<"/api/fotos/[ref]/[id]">) {
  const { ref, id } = await params;
  const user = await getSessionUser();
  if (!user?.emailVerified || !/^[0-9a-f-]{36}$/i.test(id))
    return new Response("Nicht gefunden", { status: 404 });
  const db = getDb();
  const order = await getOwnedOrder(db, ref, user.id);
  if (!order) return new Response("Nicht gefunden", { status: 404 });
  const [photo] = await db
    .select()
    .from(orderPhotos)
    .where(and(eq(orderPhotos.id, id), eq(orderPhotos.orderId, order.id)));
  if (!photo) return new Response("Nicht gefunden", { status: 404 });
  return fileResponse(photo.storageKey, {
    contentType: "image/jpeg",
    filename: `foto-${id.slice(0, 8)}.jpg`,
    download: false,
  });
}
