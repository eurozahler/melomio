import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { getLandingBySlug } from "@/marketing/landing";
import { getAdminUser } from "@/server/admin";
import { getStorage } from "@/storage";

/** Hörbeispiel einer Landingpage (öffentlich, solange die Seite veröffentlicht ist; sonst nur für Admins). */
export async function GET(_request: Request, { params }: RouteContext<"/api/hoerbeispiel/[slug]">) {
  const { slug } = await params;
  const db = getDb();
  let page = await getLandingBySlug(db, slug);
  let isPublic = true;
  if (!page && (await getAdminUser())) {
    page = await getLandingBySlug(db, slug, true);
    isPublic = false;
  }
  if (!page?.sampleAudioKey) return new Response("Nicht gefunden", { status: 404 });
  const file = await getStorage(getEnv()).open(page.sampleAudioKey);
  if (!file) return new Response("Nicht gefunden", { status: 404 });
  return new Response(file.stream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(file.size),
      "Cache-Control": isPublic ? "public, max-age=3600" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
