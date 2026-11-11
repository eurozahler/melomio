import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { accountName, exchangeCode } from "@/publishing/dropbox";
import { saveDropboxConnection } from "@/publishing/target";
import { getAdminUser } from "@/server/admin";

/** Rückleitung von Dropbox: Code gegen Refresh-Token tauschen und verschlüsselt speichern. */
export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return new Response("Nicht gefunden", { status: 404 });
  const env = getEnv();
  const url = new URL(request.url);
  const jar = await cookies();
  const expected = jar.get("dropbox_state")?.value ?? "";
  jar.delete({ name: "dropbox_state", path: "/api/admin/dropbox" });
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const back = `${env.APP_BASE_URL}/admin/veroeffentlichungen`;
  if (
    !code ||
    !expected ||
    expected.length !== state.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(state))
  ) {
    return Response.redirect(`${back}?dropbox=fehler`, 302);
  }
  try {
    const app = { appKey: env.DROPBOX_APP_KEY ?? "", appSecret: env.DROPBOX_APP_SECRET ?? "" };
    const tokens = await exchangeCode(app, code, `${env.APP_BASE_URL}/api/admin/dropbox/callback`);
    await saveDropboxConnection(getDb(), env.BETTER_AUTH_SECRET, {
      refreshToken: tokens.refreshToken,
      accountName: await accountName(tokens.accessToken),
      userId: admin.id,
    });
    return Response.redirect(`${back}?dropbox=verbunden`, 302);
  } catch (error) {
    console.error("[Dropbox]", error);
    return Response.redirect(`${back}?dropbox=fehler`, 302);
  }
}
