import { expect, test } from "@playwright/test";
import { grantRole } from "../../src/admin/service";
import { createDb } from "../../src/db/client";
import { orderViaQuestionnaire, registerAndVerify, uniqueEmail } from "./helpers";

/** Abnahme M10: nur Admins sehen den Admin-Bereich; Bestellungen, Einstellungen mit Protokoll. */

const PASSWORD = "Sommer-Lied-2026";

async function makeAdmin(email: string) {
  const { db, pool } = createDb(process.env.DATABASE_URL_TEST!, { max: 1 });
  try {
    await grantRole(db, email, "admin");
  } finally {
    await pool.end();
  }
}

test("ohne Anmeldung geht es zur Anmeldung", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/anmelden/);
});

test("ein normaler Kunde bekommt den Admin-Bereich nicht zu sehen", async ({ page }) => {
  await registerAndVerify(page, uniqueEmail("kunde"), PASSWORD);
  // Hinweis: Wegen Streaming liefert Next.js hier HTTP 200, zeigt aber die 404-Seite ohne Admin-Inhalt.
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Seite nicht gefunden" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Einstellungen" })).toHaveCount(0);
  await page.goto("/admin/einstellungen");
  await expect(page.getByRole("heading", { level: 1, name: "Seite nicht gefunden" })).toBeVisible();
  const audio = await page.request.get("/api/admin/kandidat/00000000-0000-0000-0000-000000000000");
  expect(audio.status()).toBe(404);
});

test("Admin sieht Bestellungen und ändert eine Einstellung mit Protokoll", async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("admin");
  const ref = await orderViaQuestionnaire(page, email, PASSWORD);
  await makeAdmin(email);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await expect(page.getByTestId("kpi-paid")).toBeVisible();

  // Bestellung finden und öffnen
  await page.goto(`/admin/bestellungen?q=${ref}`);
  await expect(page.getByTestId("admin-order-row")).toHaveCount(1);
  await page.getByRole("link", { name: ref }).click();
  await expect(page.getByRole("heading", { level: 1, name: ref })).toBeVisible();
  await expect(page.getByText(email).filter({ visible: true })).toBeVisible();

  // Einstellung ändern → erscheint im Protokoll
  await page.goto("/admin/einstellungen");
  const field = page.getByTestId("setting-preview_expiry_days");
  await field.fill("21");
  await field.locator("xpath=following-sibling::button").click();
  await expect(page.getByRole("status").filter({ hasText: "Gespeichert." })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("setting-preview_expiry_days")).toHaveValue("21");
  await expect(page.getByTestId("audit-log")).toContainText("setting.update");
  await expect(page.getByTestId("audit-log")).toContainText(email);

  // Ungültiger Wert wird abgelehnt
  await page.getByTestId("setting-preview_expiry_days").fill("999");
  await page.getByTestId("setting-preview_expiry_days").locator("xpath=following-sibling::button").click();
  await expect(page.getByRole("status").filter({ hasText: "Ungültiger Wert." })).toBeVisible();
});
