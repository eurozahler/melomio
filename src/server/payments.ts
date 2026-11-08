import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { getPaymentProvider, webhookUrlFor } from "@/payments";

export function getAppPaymentProvider() {
  return getPaymentProvider(getEnv(), getDb());
}

export function getWebhookUrl() {
  return webhookUrlFor(getEnv().APP_BASE_URL);
}

/**
 * Nachweis für Einwilligungen ohne die IP-Adresse selbst zu speichern (Datensparsamkeit):
 * gesalzener Hash, nur 32 Zeichen.
 */
export async function hashedClientIp(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  if (!ip) return null;
  return createHash("sha256").update(`${ip}|${getEnv().BETTER_AUTH_SECRET}`).digest("hex").slice(0, 32);
}
