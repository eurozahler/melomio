import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { addPhoto, MAX_BYTES, PhotoError } from "@/orders/photos";
import { getSessionUser } from "@/server/session";
import { getStorage } from "@/storage";

/** Foto für das Video hochladen (nur eigene Bestellung, vor dem Kauf). Antwort: { id } oder { error }. */
export async function POST(request: Request, { params }: RouteContext<"/api/fotos/[ref]">) {
  const { ref } = await params;
  const user = await getSessionUser();
  if (!user?.emailVerified) return Response.json({ error: "not_found" }, { status: 401 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES + 64 * 1024) return Response.json({ error: "too_large" }, { status: 413 });
  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    file = null;
  }
  if (!file) return Response.json({ error: "not_image" }, { status: 400 });
  try {
    const photo = await addPhoto(
      getDb(),
      getStorage(getEnv()),
      ref,
      user.id,
      Buffer.from(await file.arrayBuffer()),
    );
    return Response.json({ id: photo.id });
  } catch (error) {
    if (error instanceof PhotoError) {
      const status = error.code === "not_found" ? 404 : error.code === "too_large" ? 413 : 400;
      return Response.json({ error: error.code }, { status });
    }
    console.error("[Foto-Upload]", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
