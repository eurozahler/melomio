import { expect, test } from "@playwright/test";
import { registerAndVerify, uniqueEmail } from "./helpers";

/** DSGVO im Kundenkonto: Daten herunterladen und Konto löschen (C4/C8). */

const PASSWORD = "Sommer-Lied-2026";

test("Datenexport und Konto löschen", async ({ page }) => {
  const email = uniqueEmail("loeschen");
  await registerAndVerify(page, email, PASSWORD);
  await page.goto("/konto");

  // Export: JSON mit der eigenen E-Mail
  const href = (await page.getByTestId("export-data").getAttribute("href"))!;
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/json");
  expect((await res.json()).konto.email).toBe(email);

  // Löschen mit Rückfrage → Bestätigungsseite, danach abgemeldet
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("delete-account").click();
  await expect(page.getByRole("heading", { level: 1, name: "Dein Konto ist gelöscht" })).toBeVisible();
  expect((await page.request.get(href)).status()).toBe(401);

  // Anmelden mit den alten Daten geht nicht mehr
  await page.goto("/anmelden");
  await page.getByRole("tab", { name: "Mit Passwort" }).click();
  await page.getByLabel("E-Mail-Adresse").filter({ visible: true }).fill(email);
  await page.getByLabel("Passwort").filter({ visible: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByRole("alert").filter({ visible: true }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/anmelden/);
});
