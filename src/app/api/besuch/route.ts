import { z } from "zod";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { resolveAttribution } from "@/domain/attribution";
import { countablePath, isBot, recordPageView } from "@/marketing/stats";

/**
 * Zählt einen Seitenaufruf (Startseite, Landingpages, Fragebogen-Start) als Tagessumme je Herkunft.
 * Es wird nichts über die Person gespeichert: keine IP-Adresse, kein Cookie, keine Kennung.
 */
const bodySchema = z.object({
  path: z.string().max(200),
  search: z.string().max(1500),
  referrer: z.string().max(500).nullable(),
});

export async function POST(request: Request) {
  if (isBot(request.headers.get("user-agent"))) return new Response(null, { status: 204 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4096) return new Response(null, { status: 413 });
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(JSON.parse(await request.text()));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!countablePath(body.path)) return new Response(null, { status: 204 });
  const ownHost = new URL(getEnv().APP_BASE_URL).hostname;
  const attribution = resolveAttribution(new URLSearchParams(body.search), body.referrer, ownHost);
  try {
    await recordPageView(getDb(), body.path, attribution);
  } catch (error) {
    console.error("[Besuch]", error);
  }
  return new Response(null, { status: 204 });
}
