import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "@/config/env";
import { authorizeUrl } from "@/publishing/dropbox";
import { getAdminUser } from "@/server/admin";

/** „Mit Dropbox verbinden“: weiter zur Dropbox-Anmeldung (Schutz gegen fremde Rückleitungen per state-Cookie). */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return new Response("Nicht gefunden", { status: 404 });
  const env = getEnv();
  if (!env.DROPBOX_APP_KEY || !env.DROPBOX_APP_SECRET) {
    return new Response("DROPBOX_APP_KEY und DROPBOX_APP_SECRET fehlen auf dem Server.", { status: 400 });
  }
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("dropbox_state", state, {
    httpOnly: true,
    secure: env.APP_BASE_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/api/admin/dropbox",
    maxAge: 600,
  });
  const url = authorizeUrl(
    { appKey: env.DROPBOX_APP_KEY, appSecret: env.DROPBOX_APP_SECRET },
    `${env.APP_BASE_URL}/api/admin/dropbox/callback`,
    state,
  );
  return Response.redirect(url, 302);
}
