import { connection } from "next/server";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { adsActive, getMarketingConfig } from "@/marketing/config";
import { ConsentManager } from "./consent";

/**
 * Seitenweite Marketing-Bausteine (beim Aufruf geladen):
 * - Google-Search-Console-Bestätigung (Meta-Tag)
 * - Testbetrieb: Suchmaschinen aussperren (noindex)
 * - Cookie-Banner + Google-Ads-Code, wenn im Admin eingeschaltet
 */
export async function MarketingHead() {
  await connection();
  const env = getEnv();
  let config;
  try {
    config = await getMarketingConfig(getDb());
  } catch {
    return null;
  }
  return (
    <>
      {config.siteVerification && <meta name="google-site-verification" content={config.siteVerification} />}
      {env.isTestOperation && <meta name="robots" content="noindex, nofollow" />}
      {adsActive(config) && <ConsentManager adsId={config.googleAdsId} />}
    </>
  );
}
