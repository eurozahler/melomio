// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { seed } from "@/db/seed";
import { adCosts, appSettings, landingPages, occasions, orders, pageViewStats, previewUsage, priceSnapshots } from "@/db/schema";
import { getMarketingConfig, MARKETING_KEY, saveMarketingConfig } from "@/marketing/config";
import {
  getLandingBySlug,
  getLandingForEdit,
  LandingError,
  listPublishedLandings,
  saveLanding,
  setLandingPublished,
} from "@/marketing/landing";
import { getMarketingReport, recordPageView, saveAdCost } from "@/marketing/stats";
import { connectTestDb, createUserWithOrder } from "./helpers";

const { db, pool } = connectTestDb();
// Eigener Testmonat weit in der Zukunft, damit andere Tests die Zahlen nicht beeinflussen
const MONTH = "2091-03";
const DAY = new Date("2091-03-15T10:00:00Z");
let occasionId: string;
let slug: string;
const actor = null as unknown as string;

beforeAll(async () => {
  await seed(db);
  const [o] = await db.select().from(occasions).where(eq(occasions.slug, "geburtstag"));
  occasionId = o!.id;
  slug = `test-${randomUUID().slice(0, 8)}`;
  await db.delete(landingPages).where(eq(landingPages.occasionId, occasionId));
  await db.delete(pageViewStats).where(inArray(pageViewStats.day, ["2091-03-15"]));
  await db.delete(adCosts).where(eq(adCosts.month, MONTH));
});

afterAll(async () => {
  await db.delete(landingPages).where(eq(landingPages.occasionId, occasionId));
  await pool.end();
});

const content = (overrides: Record<string, unknown> = {}) => ({
  slug,
  metaTitle: "Geburtstagslied personalisiert | melomio",
  metaDescription: "Ein persönlicher Song zum Geburtstag.",
  h1: "Dein Geburtstagslied",
  intro: "Erzähl uns von der Person.",
  highlights: ["Hörprobe gratis", ""],
  sections: [{ heading: "Ablauf", body: "So geht es." }],
  faqs: [{ q: "Dauer?", a: "Minuten." }, { q: "", a: "" }],
  variants: [{ key: "oma", h1: "Ein Lied für Oma", intro: "" }],
  ctaLabel: "Los geht's",
  ...overrides,
});

describe("Landingpages", () => {
  it("Vorschlag, Speichern, Veröffentlichen und Sichtbarkeit", async () => {
    const before = await getLandingForEdit(db, occasionId);
    expect(before?.exists).toBe(false);
    expect(before?.content.h1).toBeTruthy();

    await saveLanding(db, actor, occasionId, content({ h1: "" }));
    const [row] = await db.select().from(landingPages).where(eq(landingPages.occasionId, occasionId));
    expect(row?.highlights).toEqual(["Hörprobe gratis"]);
    expect(row?.faqs).toHaveLength(1);

    // Ohne Überschrift nicht veröffentlichen
    await expect(setLandingPublished(db, actor, occasionId, true)).rejects.toBeInstanceOf(LandingError);
    await saveLanding(db, actor, occasionId, content());
    expect(await getLandingBySlug(db, slug)).toBeNull();
    expect((await getLandingBySlug(db, slug, true))?.h1).toBe("Dein Geburtstagslied");

    await setLandingPublished(db, actor, occasionId, true);
    expect((await getLandingBySlug(db, slug))?.variants[0]?.key).toBe("oma");
    expect((await listPublishedLandings(db)).map((l) => l.slug)).toContain(slug);
  });

  it("Adresse darf nicht doppelt vergeben werden und Varianten-Kürzel sind eindeutig", async () => {
    const [other] = await db.select().from(occasions).where(eq(occasions.slug, "hochzeit"));
    await expect(saveLanding(db, actor, other!.id, content())).rejects.toMatchObject({ code: "slug_taken" });
    await expect(
      saveLanding(db, actor, occasionId, content({ variants: [{ key: "a", h1: "", intro: "" }, { key: "a", h1: "", intro: "" }] })),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("Auswertung", () => {
  it("zählt Besuche, Bestellungen je Herkunft, Umsatz und Kosten", async () => {
    const google = { source: "google", medium: "cpc", campaign: "muttertag" };
    await recordPageView(db, `/lieder/${slug}`, google, DAY);
    await recordPageView(db, `/lieder/${slug}`, google, DAY);
    await recordPageView(db, "/song/geburtstag", google, DAY);
    await recordPageView(db, "/admin", google, DAY); // wird ignoriert

    // Zwei Bestellungen aus Google Ads, eine davon gekauft
    const created = new Date("2091-03-15T11:00:00Z");
    const a = await createUserWithOrder(db);
    const b = await createUserWithOrder(db);
    for (const o of [a, b])
      await db
        .update(orders)
        .set({ isTest: false, createdAt: created, attribution: { ...google, landing: slug } })
        .where(eq(orders.id, o.order.id));
    await db.insert(previewUsage).values([
      { userId: a.userId, orderId: a.order.id },
      { userId: b.userId, orderId: b.order.id },
    ]);
    await db.update(orders).set({ paidAt: created }).where(eq(orders.id, a.order.id));
    await db.insert(priceSnapshots).values({
      orderId: a.order.id,
      items: [],
      netCents: 2512,
      taxCents: 477,
      grossCents: 2989,
      taxRateBp: 1900,
      currency: "EUR",
    });
    expect(await saveAdCost(db, a.userId, { month: MONTH, source: "google", campaign: "muttertag", costCents: 1000 })).toBe(true);
    // Erneutes Speichern überschreibt
    await saveAdCost(db, a.userId, { month: MONTH, source: "google", campaign: "muttertag", costCents: 1500 });

    const byCampaign = await getMarketingReport(db, { fromMonth: MONTH, toMonth: MONTH, groupBy: "campaign" });
    const row = byCampaign.find((r) => r.source === "google" && r.campaign === "muttertag");
    expect(row).toMatchObject({ visits: 2, starts: 1, orders: 2, previews: 2, paid: 1, revenueNetCents: 2512, costCents: 1500 });

    const byLanding = await getMarketingReport(db, { fromMonth: MONTH, toMonth: MONTH, groupBy: "landing" });
    expect(byLanding.find((r) => r.landing === `/lieder/${slug}` && r.orders > 0)?.paid).toBe(1);
    expect(byLanding.find((r) => r.landing === `/lieder/${slug}` && r.visits > 0)?.visits).toBe(2);

    // Testbestellungen getrennt
    const testOnly = await getMarketingReport(db, { fromMonth: MONTH, toMonth: MONTH, groupBy: "channel", test: true });
    expect(testOnly.reduce((s, r) => s + r.orders, 0)).toBe(0);
  });
});

describe("Google-Einstellungen", () => {
  it("speichert nur gültige Werte und verlangt die ID zum Einschalten", async () => {
    const { userId } = await createUserWithOrder(db);
    expect((await saveMarketingConfig(db, userId, { adsEnabled: true, googleAdsId: "", purchaseLabel: "", siteVerification: "" })).ok).toBe(false);
    expect(
      (await saveMarketingConfig(db, userId, { adsEnabled: true, googleAdsId: "AW-123456789", purchaseLabel: "Kauf_1", siteVerification: "abc" })).ok,
    ).toBe(true);
    expect((await getMarketingConfig(db)).googleAdsId).toBe("AW-123456789");
    // aufräumen: andere Tests erwarten nur die normalen Einstellungen
    await db.delete(appSettings).where(eq(appSettings.key, MARKETING_KEY));
  });
});
