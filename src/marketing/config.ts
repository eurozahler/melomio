import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/admin/service";
import type { Database } from "@/db/client";
import { appSettings } from "@/db/schema";

/**
 * Google-Einstellungen (im Admin unter „Marketing“):
 * - Google Ads: Konto-ID (AW-…) und Conversion-Label für Käufe. Der Google-Code wird nur geladen,
 *   wenn der Besucher im Cookie-Banner zustimmt.
 * - Google Search Console: Bestätigungscode (Meta-Tag), keine Cookies.
 */

export const MARKETING_KEY = "marketing_config";

export const marketingConfigSchema = z.object({
  adsEnabled: z.boolean(),
  googleAdsId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(AW-\d{6,15})?$/, "Format: AW-123456789"),
  purchaseLabel: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{0,64}$/, "Nur Buchstaben, Ziffern, _ und -"),
  siteVerification: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{0,100}$/, "Nur den Code aus dem content-Feld eintragen"),
});

export type MarketingConfig = z.infer<typeof marketingConfigSchema>;

export const EMPTY_MARKETING_CONFIG: MarketingConfig = {
  adsEnabled: false,
  googleAdsId: "",
  purchaseLabel: "",
  siteVerification: "",
};

export async function getMarketingConfig(db: Database): Promise<MarketingConfig> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, MARKETING_KEY));
  const parsed = marketingConfigSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : EMPTY_MARKETING_CONFIG;
}

/** Ist Google Ads vollständig eingerichtet und eingeschaltet? */
export const adsActive = (c: MarketingConfig) => c.adsEnabled && Boolean(c.googleAdsId);

export async function saveMarketingConfig(db: Database, actorId: string, raw: unknown) {
  const parsed = marketingConfigSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, problems: parsed.error.issues.map((i) => i.message) };
  const value = parsed.data;
  if (value.adsEnabled && !value.googleAdsId)
    return { ok: false as const, problems: ["Zum Einschalten bitte die Google-Ads-ID eintragen."] };
  await db
    .insert(appSettings)
    .values({ key: MARKETING_KEY, value, updatedBy: actorId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: actorId, updatedAt: new Date() } });
  await audit(db, {
    actorUserId: actorId,
    action: "marketing.config",
    entity: "app_setting",
    entityId: MARKETING_KEY,
    newValue: value,
  });
  return { ok: true as const };
}
