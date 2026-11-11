import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { grantRole } from "../../src/admin/service";
import { createDb } from "../../src/db/client";
import { appSettings, landingPages, occasions, pageViewStats } from "../../src/db/schema";
import { MARKETING_KEY, saveMarketingConfig } from "../../src/marketing/config";
import { berlinDay } from "../../src/marketing/stats";
import { registerAndVerify, uniqueEmail } from "./helpers";

/** Marketing: Landingpage anlegen und veröffentlichen, Herkunft bis in den Fragebogen, Cookie-Banner. */

const PASSWORD = "Sommer-Lied-2026";

async function withDb<T>(fn: (db: ReturnType<typeof createDb>["db"]) => Promise<T>) {
  const { db, pool } = createDb(process.env.DATABASE_URL_TEST!, { max: 1 });
  try {
    return await fn(db);
  } finally {
    await pool.end();
  }
}

test("Landingpage anlegen, veröffentlichen und aus einer Anzeige aufrufen", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("marketing");
  await registerAndVerify(page, email, PASSWORD);
  await withDb((db) => grantRole(db, email, "admin"));
  const occasionId = await withDb(async (db) => {
    const [o] = await db.select().from(occasions).where(eq(occasions.slug, "geburtstag"));
    await db.delete(landingPages).where(eq(landingPages.occasionId, o!.id));
    return o!.id;
  });
  const slug = `e2e-${Date.now().toString(36)}`;

  try {
    await page.goto("/admin/marketing/landingpages");
    await expect(page.getByRole("heading", { level: 1, name: "Landingpages" })).toBeVisible();
    await page.goto(`/admin/marketing/landingpages/${occasionId}`);
    await page.getByTestId("landing-slug").fill(slug);
    await page.getByTestId("landing-h1-input").fill("Das Geburtstagslied, das nur ihr gehört");
    await page.getByTestId("landing-save").click();
    await expect(page.getByText("Gespeichert.")).toBeVisible();

    // Vor dem Veröffentlichen: nur Admins sehen die Vorschau
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(`/lieder/${slug}`);
    await expect(guestPage.getByRole("heading", { level: 1, name: "Seite nicht gefunden" })).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await page.getByTestId("landing-publish").click();
    await expect(page.getByText("Veröffentlicht – die Seite ist jetzt online.")).toBeVisible();

    // Besucher kommt über eine Google-Anzeige
    await guestPage.goto(`/lieder/${slug}?utm_source=google&utm_medium=cpc&utm_campaign=e2e-test&gclid=TeSt123`);
    await expect(guestPage.getByTestId("landing-h1")).toHaveText("Das Geburtstagslied, das nur ihr gehört");
    await expect(guestPage).toHaveTitle(/melomio/);
    const ld = await guestPage.locator('script[type="application/ld+json"]').textContent();
    expect(ld).toContain('"FAQPage"');
    await guestPage.getByTestId("landing-cta").click();
    await expect(guestPage).toHaveURL(/\/song\/geburtstag\?.*utm_source=google.*gclid=TeSt123.*lp=e2e-/);
    await guest.close();

    // Der Besuch wurde gezählt (Tagessumme, ohne Person)
    await expect(async () => {
      const rows = await withDb((db) =>
        db
          .select()
          .from(pageViewStats)
          .where(and(eq(pageViewStats.day, berlinDay()), eq(pageViewStats.path, `/lieder/${slug}`))),
      );
      expect(rows.find((r) => r.source === "google" && r.campaign === "e2e-test")?.views).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 10_000 });

    // Auswertung und Link-Baukasten laden
    await page.goto("/admin/marketing");
    await expect(page.getByTestId("marketing-kpis")).toBeVisible();
    await page.goto("/admin/marketing/kampagnen");
    await expect(page.getByTestId("built-link")).toContainText(`/lieder/${slug}?utm_source=google&utm_medium=cpc`);
    await page.getByTestId("adcost-euro").fill("12,50");
    await page.getByRole("button", { name: "Kosten speichern" }).click();
    await expect(page.getByText("Kosten gespeichert.")).toBeVisible();
  } finally {
    await withDb((db) => db.delete(landingPages).where(eq(landingPages.occasionId, occasionId)));
  }
});

test("Cookie-Banner erscheint nur mit eingeschaltetem Google Ads und merkt sich die Wahl", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("consent-banner")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cookie-Einstellungen" })).toBeHidden();

  await withDb(async (db) => {
    await db.delete(appSettings).where(eq(appSettings.key, MARKETING_KEY));
    await saveMarketingConfig(db, null as unknown as string, {
      adsEnabled: true,
      googleAdsId: "AW-123456789",
      purchaseLabel: "kauf",
      siteVerification: "e2eVerify",
    });
  });
  try {
    await page.goto("/");
    await expect(page.getByTestId("consent-banner")).toBeVisible();
    await expect(page.locator('meta[name="google-site-verification"]')).toHaveAttribute("content", "e2eVerify");
    // Vor der Zustimmung kein Google-Code
    await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Ablehnen" }).click();
    await expect(page.getByTestId("consent-banner")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Cookie-Einstellungen" })).toBeVisible();
    await expect(page.getByTestId("consent-banner")).toHaveCount(0);
    await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
    // Wahl ändern über die Fußzeile
    await page.getByRole("button", { name: "Cookie-Einstellungen" }).click();
    await page.route("https://www.googletagmanager.com/**", (route) => route.fulfill({ body: "" }));
    await page.getByRole("button", { name: "Akzeptieren" }).click();
    await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(1);
  } finally {
    await withDb((db) => db.delete(appSettings).where(eq(appSettings.key, MARKETING_KEY)));
  }
});
