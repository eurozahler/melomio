import { describe, expect, it } from "vitest";
import { channelLabel, resolveAttribution, withForwardedParams } from "@/domain/attribution";
import { draftDataSchema, emptyDraft } from "@/domain/draft";
import { marketingConfigSchema } from "@/marketing/config";
import { landingInputSchema, looksLikeMp3 } from "@/marketing/landing";
import { countablePath, isBot } from "@/marketing/stats";

const q = (s: string) => new URLSearchParams(s);
const OWN = "melomio.de";

describe("Herkunft (Attribution)", () => {
  it("utm-Parameter haben Vorrang", () => {
    const a = resolveAttribution(q("utm_source=Instagram&utm_medium=paid_social&utm_campaign=Muttertag"), "https://www.google.com/", OWN);
    expect(a).toMatchObject({ source: "instagram", medium: "paid_social", campaign: "muttertag", referrer: "www.google.com" });
  });

  it("Google-Ads-Klick ohne utm wird als google / cpc erkannt, gclid bleibt unverändert", () => {
    const a = resolveAttribution(q("gclid=Cj0KCQ_aBc-XyZ"), null, OWN);
    expect(a).toMatchObject({ source: "google", medium: "cpc", campaign: "", gclid: "Cj0KCQ_aBc-XyZ" });
  });

  it("Suchmaschinen, soziale Netze, andere Seiten und direkt", () => {
    expect(resolveAttribution(q(""), "https://www.google.de/", OWN)).toMatchObject({ source: "google", medium: "organic" });
    expect(resolveAttribution(q(""), "https://l.instagram.com/x", OWN)).toMatchObject({ source: "instagram", medium: "social" });
    expect(resolveAttribution(q(""), "https://www.hochzeitsblog.de/artikel", OWN)).toMatchObject({
      source: "hochzeitsblog.de",
      medium: "referral",
    });
    expect(resolveAttribution(q(""), "https://melomio.de/lieder/x", OWN)).toMatchObject({ source: "direkt", medium: "none" });
    expect(resolveAttribution(q(""), null, OWN)).toEqual({ source: "direkt", medium: "none", campaign: "" });
  });

  it("weitergereichte Herkunftsseite (ref) und Landingpage (lp, k) werden übernommen", () => {
    const a = resolveAttribution(q("ref=www.bing.com&lp=geburtstag&k=oma"), "https://melomio.de/lieder/geburtstag", OWN);
    expect(a).toMatchObject({ source: "bing", medium: "organic", landing: "geburtstag", variant: "oma" });
  });

  it("entfernt gefährliche Zeichen und kürzt", () => {
    const a = resolveAttribution(q(`utm_source=<script>&utm_campaign=${"x".repeat(500)}`), null, OWN);
    expect(a.source).toBe("script");
    expect(a.campaign.length).toBe(150);
  });

  it("Links reichen Parameter weiter und ergänzen die fremde Herkunft", () => {
    expect(withForwardedParams("/song/geburtstag", q("utm_source=google&gclid=A1&foo=bar"), "https://www.google.com/", OWN, { lp: "geburtstag" })).toBe(
      "/song/geburtstag?utm_source=google&gclid=A1&ref=www.google.com&lp=geburtstag",
    );
    expect(withForwardedParams("/song/x", q(""), "https://melomio.de/", OWN)).toBe("/song/x");
  });

  it("Namen für die Auswertung", () => {
    expect(channelLabel("google", "cpc")).toBe("Google Ads");
    expect(channelLabel("google", "organic")).toBe("Google (Suche)");
    expect(channelLabel("direkt", "none")).toBe("Direkt / unbekannt");
  });

  it("Entwurf darf eine Herkunft tragen", () => {
    const parsed = draftDataSchema.parse({ ...emptyDraft(), attribution: { source: "google", medium: "cpc", campaign: "" } });
    expect(parsed.attribution?.source).toBe("google");
  });
});

describe("Besucherzählung", () => {
  it("zählt nur Startseite, Landingpages und Fragebogen-Start", () => {
    expect(countablePath("/")).toBe("/");
    expect(countablePath("/lieder/geburtstag/")).toBe("/lieder/geburtstag");
    expect(countablePath("/song/hochzeit?x=1")).toBe("/song/hochzeit");
    expect(countablePath("/admin")).toBeNull();
    expect(countablePath("/lieder/../admin")).toBeNull();
  });

  it("erkennt Bots", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile")).toBe(false);
  });
});

describe("Eingaben im Admin", () => {
  it("Google-Einstellungen prüfen das Format", () => {
    expect(marketingConfigSchema.safeParse({ adsEnabled: true, googleAdsId: "aw-123456789", purchaseLabel: "AbC-1", siteVerification: "" }).data?.googleAdsId).toBe("AW-123456789");
    expect(marketingConfigSchema.safeParse({ adsEnabled: true, googleAdsId: "G-123", purchaseLabel: "", siteVerification: "" }).success).toBe(false);
    expect(marketingConfigSchema.safeParse({ adsEnabled: false, googleAdsId: "", purchaseLabel: "<x>", siteVerification: "" }).success).toBe(false);
  });

  it("Landingpage-Adresse nur mit erlaubten Zeichen", () => {
    const base = { metaTitle: "", metaDescription: "", h1: "", intro: "", highlights: [], sections: [], faqs: [], variants: [], ctaLabel: "" };
    expect(landingInputSchema.safeParse({ ...base, slug: "Geburtstag-Lied" }).data?.slug).toBe("geburtstag-lied");
    expect(landingInputSchema.safeParse({ ...base, slug: "a/b" }).success).toBe(false);
    expect(landingInputSchema.safeParse({ ...base, slug: "x" }).success).toBe(false);
  });

  it("erkennt MP3-Dateien", () => {
    expect(looksLikeMp3(Buffer.from("ID3\u0004\u0000"))).toBe(true);
    expect(looksLikeMp3(Buffer.from([0xff, 0xfb, 0x90, 0x00]))).toBe(true);
    expect(looksLikeMp3(Buffer.from("%PDF-1.4"))).toBe(false);
  });
});
