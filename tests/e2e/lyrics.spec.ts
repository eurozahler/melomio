import { expect, test } from "@playwright/test";
import { orderViaQuestionnaire, registerAndVerify, uniqueEmail } from "./helpers";

/** Abnahme M5: Songtext erscheint, lässt sich korrigieren, neu formulieren und freigeben. */

const PASSWORD = "Sommer-Lied-2026";

test("Songtext prüfen, selbst bearbeiten, KI neu formulieren, freigeben", async ({ page }) => {
  const ref = await orderViaQuestionnaire(page, uniqueEmail("lyrics"), PASSWORD);

  await expect(page.getByTestId("order-status")).toHaveText("Songtext bereit zur Prüfung", {
    timeout: 30_000,
  });
  await page.getByRole("link", { name: /Songtext ansehen und prüfen/ }).click();
  await expect(page).toHaveURL(new RegExp(`/bestellung/${ref}/songtext`));

  // Fassung 1 vom Test-Baustein – mit Details aus dem Fragebogen
  await expect(page.getByTestId("lyrics-title")).toHaveText("Für Anna");
  await expect(page.getByTestId("lyrics")).toContainText("Sie lacht laut und liebt Kaffee");
  await expect(page.getByTestId("revisions-left")).toHaveText("Noch 1 KI-Neuformulierung kostenlos");

  // Selbst bearbeiten
  await page.getByRole("button", { name: "Selbst bearbeiten" }).click();
  await page.getByLabel("Titel").filter({ visible: true }).fill("Annas Geburtstagslied");
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  await expect(page.getByTestId("lyrics-title")).toHaveText("Annas Geburtstagslied");

  // KI neu formulieren lassen (einmal kostenlos)
  await page.getByRole("button", { name: "KI neu formulieren lassen" }).click();
  await page
    .getByLabel("Was soll anders werden? (freiwillig)")
    .filter({ visible: true })
    .fill("Mehr über Kaffee");
  await page.getByRole("button", { name: "Neu formulieren" }).click();
  await expect(page.getByTestId("lyrics-title")).toHaveText("Für Anna (neue Fassung 1)", { timeout: 30_000 });
  await expect(page.getByTestId("revisions-left")).toHaveText("Keine KI-Neuformulierung mehr übrig");
  await expect(page.getByRole("button", { name: "KI neu formulieren lassen" })).toBeDisabled();

  // Freigeben (mit Rückfrage)
  await page.getByRole("button", { name: "Songtext freigeben" }).click();
  await expect(page.getByText("Songtext endgültig freigeben?")).toBeVisible();
  await page.getByRole("button", { name: "Ja, freigeben" }).click();
  await expect(page.getByText(/Songtext freigegeben\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Selbst bearbeiten" })).toHaveCount(0);

  await page.goto("/konto");
  await expect(page.getByTestId("order-status")).toHaveText("Songtext freigegeben");
});

test("Ein fremdes Konto sieht den Songtext nicht", async ({ page, browser }) => {
  const ref = await orderViaQuestionnaire(page, uniqueEmail("owner"), PASSWORD);
  await expect(page.getByTestId("order-status")).toHaveText("Songtext bereit zur Prüfung", {
    timeout: 30_000,
  });

  const other = await browser.newContext();
  const strangerPage = await other.newPage();
  await registerAndVerify(strangerPage, uniqueEmail("stranger"), PASSWORD);
  await strangerPage.goto(`/bestellung/${ref}/songtext`);
  await expect(strangerPage.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
  await other.close();
});
