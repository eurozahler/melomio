import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { publications, videos } from "@/db/schema";
import { getAdminUser } from "@/server/admin";
import { fileResponse } from "@/server/files";

/** Admin: Video einer Veröffentlichung ansehen (vor der Freigabe). */
export async function GET(_request: Request, { params }: RouteContext<"/api/admin/veroeffentlichung/[id]">) {
  const admin = await getAdminUser();
  if (!admin) return new Response("Nicht gefunden", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const [row] = await getDb()
    .select({ key: videos.storageKey })
    .from(publications)
    .innerJoin(videos, eq(publications.videoId, videos.id))
    .where(eq(publications.id, id));
  if (!row) return new Response("Nicht gefunden", { status: 404 });
  return fileResponse(row.key, {
    contentType: "video/mp4",
    filename: `veroeffentlichung-${id.slice(0, 8)}.mp4`,
    download: false,
  });
}
