import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { listPublishedLandings } from "@/marketing/landing";

/** Sitemap für Google: Startseite, veröffentlichte Landingpages und Rechtstexte. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = getEnv().APP_BASE_URL;
  const landings = await listPublishedLandings(getDb());
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    ...landings.map((l) => ({
      url: `${base}/lieder/${l.slug}`,
      lastModified: l.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
    { url: `${base}/partnerbedingungen`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/impressum`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/datenschutz`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/agb`, changeFrequency: "yearly", priority: 0.1 },
  ];
}
