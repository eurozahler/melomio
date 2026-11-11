import { z } from "zod";

/**
 * Herkunft eines Besuchers („Attribution“) – ohne Cookies:
 * Die Werbe-Parameter (utm_*, gclid) und die Herkunftsseite werden über die Links bis in den
 * Fragebogen mitgegeben und beim Anlegen der Bestellung gespeichert.
 */

const text = (max: number) => z.string().trim().max(max);

export const attributionSchema = z.object({
  source: text(80),
  medium: text(80),
  campaign: text(150),
  term: text(150).optional(),
  content: text(150).optional(),
  /** Google-Ads-Klick-ID (für die Zuordnung von Käufen zu Anzeigen). */
  gclid: text(200).optional(),
  /** Landingpage-Slug, über die der Besucher kam. */
  landing: text(80).optional(),
  /** Landingpage-Variante (?k=…). */
  variant: text(40).optional(),
  /** Host der externen Herkunftsseite (z. B. www.google.com), nie die volle Adresse. */
  referrer: text(120).optional(),
});

export type Attribution = z.infer<typeof attributionSchema>;

/** Diese Parameter werden über interne Links weitergereicht. */
export const FORWARD_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gbraid",
  "wbraid",
  "k",
  "lp",
  "ref",
] as const;

type Params = { get(name: string): string | null };

const SEARCH_ENGINES: [RegExp, string][] = [
  [/(^|\.)google\./, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)ecosia\.org$/, "ecosia"],
  [/(^|\.)yahoo\./, "yahoo"],
];
const SOCIAL: [RegExp, string][] = [
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)pinterest\./, "pinterest"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "x"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
];

const clean = (v: string | null | undefined, max: number) => {
  const s = (v ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N} ._\-/+:]/gu, "").slice(0, max);
  return s || undefined;
};

/** Nur den Host einer Adresse (oder einen schon reinen Host) übernehmen. */
export function refererHost(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase().slice(0, 120);
  } catch {
    return undefined;
  }
}

/**
 * Ermittelt die Herkunft aus den Adress-Parametern und der Herkunftsseite.
 * Reihenfolge: utm-Parameter → Google-Ads-Klick → Suchmaschine/soziales Netz → andere Seite → direkt.
 */
export function resolveAttribution(params: Params, referrer: string | null | undefined, ownHost: string): Attribution {
  const host = refererHost(params.get("ref")) ?? refererHost(referrer);
  const external = host && host !== ownHost.toLowerCase() ? host : undefined;
  // Klick-IDs sind groß-/kleinschreibungsabhängig – nicht umwandeln, nur unerlaubte Zeichen entfernen
  const gclid =
    (params.get("gclid") ?? params.get("gbraid") ?? params.get("wbraid"))
      ?.trim()
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 200) || undefined;
  const base = {
    term: clean(params.get("utm_term"), 150),
    content: clean(params.get("utm_content"), 150),
    gclid,
    landing: clean(params.get("lp"), 80),
    variant: clean(params.get("k"), 40),
    referrer: external,
  };
  const utmSource = clean(params.get("utm_source"), 80);
  let result: Attribution;
  if (utmSource) {
    result = {
      source: utmSource,
      medium: clean(params.get("utm_medium"), 80) ?? (gclid ? "cpc" : "kampagne"),
      campaign: clean(params.get("utm_campaign"), 150) ?? "",
      ...base,
    };
  } else if (gclid) {
    result = { source: "google", medium: "cpc", campaign: clean(params.get("utm_campaign"), 150) ?? "", ...base };
  } else if (external) {
    const engine = SEARCH_ENGINES.find(([re]) => re.test(external));
    const social = SOCIAL.find(([re]) => re.test(external));
    result = engine
      ? { source: engine[1], medium: "organic", campaign: "", ...base }
      : social
        ? { source: social[1], medium: "social", campaign: "", ...base }
        : { source: external.replace(/^www\./, ""), medium: "referral", campaign: "", ...base };
  } else {
    result = { source: "direkt", medium: "none", campaign: "", ...base };
  }
  // Leere Felder weglassen
  return Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined)) as Attribution;
}

/**
 * Hängt die Werbe-Parameter der aktuellen Seite an einen internen Link an. Kam der Besucher von
 * einer fremden Seite, wird deren Host als `ref` mitgegeben (die Herkunftsseite geht beim Klick
 * sonst verloren).
 */
export function withForwardedParams(
  href: string,
  current: Params,
  referrer: string | null | undefined,
  ownHost: string,
  extra: Record<string, string | undefined> = {},
): string {
  const url = new URL(href, "https://x.invalid");
  for (const key of FORWARD_PARAMS) {
    const v = current.get(key);
    if (v && !url.searchParams.has(key)) url.searchParams.set(key, v.slice(0, 200));
  }
  if (!url.searchParams.has("ref")) {
    const host = refererHost(referrer);
    if (host && host !== ownHost.toLowerCase()) url.searchParams.set("ref", host);
  }
  for (const [k, v] of Object.entries(extra)) if (v && !url.searchParams.has(k)) url.searchParams.set(k, v);
  return `${url.pathname}${url.search}`;
}

/** Lesbarer Name einer Herkunft für die Auswertung. */
export function channelLabel(source: string, medium: string): string {
  if (medium === "cpc" && source === "google") return "Google Ads";
  if (medium === "organic") return `${source[0]?.toUpperCase()}${source.slice(1)} (Suche)`;
  if (medium === "social") return `${source[0]?.toUpperCase()}${source.slice(1)}`;
  if (medium === "affiliate") return `Partner ${source}`;
  if (source === "direkt") return "Direkt / unbekannt";
  return `${source} (${medium})`;
}
