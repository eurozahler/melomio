import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getEnv } from "@/config/env";

/** Suchmaschinen: im Testbetrieb alles sperren, sonst nur öffentliche Seiten. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const env = getEnv();
  if (env.isTestOperation) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/konto", "/bestellung/", "/partner$", "/s/", "/dev/", "/song/"],
    },
    sitemap: `${env.APP_BASE_URL}/sitemap.xml`,
  };
}
