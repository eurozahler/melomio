import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { musicCandidates } from "@/db/schema";
import { getAdminUser } from "@/server/admin";
import { fileResponse } from "@/server/files";

/** Admin: vollständigen Kandidaten anhören (für die manuelle Prüfung). Nur mit Admin-Rolle. */
export async function GET(_request: Request, { params }: RouteContext<"/api/admin/kandidat/[id]">) {
  const admin = await getAdminUser();
  if (!admin) return new Response("Nicht gefunden", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const [candidate] = await getDb().select().from(musicCandidates).where(eq(musicCandidates.id, id));
  if (!candidate) return new Response("Nicht gefunden", { status: 404 });
  return fileResponse(candidate.storageKey, {
    contentType: "audio/mpeg",
    filename: `kandidat-${id.slice(0, 8)}.mp3`,
    download: false,
  });
}
