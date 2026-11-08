import { expect, test, type Page } from "@playwright/test";

/** Abnahme M3: Fragebogen am Handy ausfüllen, neu laden – die Antworten sind noch da. */

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const next = (page: Page) => page.getByRole("button", { name: "Weiter", exact: true });

test("Startseite zeigt Anlässe und Preis", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dein persönlicher Song" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Geburtstag/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Liebe/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Hochzeit/ })).toBeVisible();
  await expect(page.getByTestId("price")).toHaveText(/9,99\s€/);
  await expect(page.getByTestId("test-mode-banner")).toBeVisible();
});

test("Fragebogen ausfüllen und nach dem Neuladen weitermachen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Geburtstag/ }).click();

  // Pflichtfrage ohne Antwort → Hinweis
  await expect(heading(page)).toHaveText("Für wen ist der Song?");
  await next(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "Bitte beantworte diese Frage." })).toBeVisible();

  await page.getByLabel("Für wen ist der Song?").filter({ visible: true }).fill("Anna");
  await next(page).click();

  await expect(heading(page)).toHaveText("Wer ist diese Person für dich?");
  await page.getByRole("radio", { name: "Freund/in" }).check();
  await next(page).click();

  // Folgefrage erscheint nur bei „Ja“
  await expect(heading(page)).toHaveText("Ist es ein runder Geburtstag?");
  await page.getByRole("radio", { name: "Ja" }).check();
  await next(page).click();
  await expect(heading(page)).toHaveText("Welcher Geburtstag wird gefeiert?");
  await page.getByLabel("Welcher Geburtstag wird gefeiert?").filter({ visible: true }).fill("50");
  await next(page).click();

  await expect(heading(page)).toHaveText("Was macht diese Person besonders?");
  await page
    .getByLabel("Was macht diese Person besonders?")
    .filter({ visible: true })
    .fill("Sie lacht laut, liebt Kaffee und Wandern.");
  await next(page).click();

  // freiwillige Fragen überspringen
  await expect(heading(page)).toHaveText("Gibt es gemeinsame Erinnerungen oder Insider?");
  await next(page).click();
  await expect(heading(page)).toHaveText("Von wem kommt der Song?");
  await next(page).click();

  // Auswahl: ohne Angaben nicht weiter
  await expect(heading(page)).toHaveText("Wie soll dein Song klingen?");
  await next(page).click();
  await expect(page.getByText("Bitte wähle ein Genre.")).toBeVisible();
  await page.getByRole("radio", { name: "Pop" }).check();
  await page.getByRole("radio", { name: "Fröhlich" }).check();
  await page.getByRole("radio", { name: "Warme Männerstimme" }).check();
  await next(page).click();

  // Zusammenfassung
  await expect(heading(page)).toHaveText("Alles beisammen?");
  await expect(page.getByText("Anna", { exact: true })).toBeVisible();
  await expect(page.getByText("50", { exact: true })).toBeVisible();
  await expect(page.getByTestId("save-state")).toHaveText(/Gespeichert/, { timeout: 10_000 });

  // Neu laden: gleicher Schritt, gleiche Antworten
  await page.reload();
  await expect(heading(page)).toHaveText("Alles beisammen?");
  await expect(page.getByText("Anna", { exact: true })).toBeVisible();
  await expect(page.getByText("Sie lacht laut, liebt Kaffee und Wandern.")).toBeVisible();
  await expect(page.getByText(/Pop · Fröhlich · Warme Männerstimme/)).toBeVisible();

  // Ändern springt zur Frage zurück, die Antwort ist vorausgefüllt
  await page.getByRole("button", { name: "Ändern" }).first().click();
  await expect(page.getByLabel("Für wen ist der Song?").filter({ visible: true })).toHaveValue("Anna");
});

test("Folgefrage bleibt bei „Nein“ ausgeblendet", async ({ page }) => {
  await page.goto("/song/geburtstag");
  await page.getByLabel("Für wen ist der Song?").filter({ visible: true }).fill("Ben");
  await next(page).click();
  await page.getByRole("radio", { name: "Familie" }).check();
  await next(page).click();
  await page.getByRole("radio", { name: "Nein" }).check();
  await next(page).click();
  await expect(heading(page)).toHaveText("Was macht diese Person besonders?");
});

test("Ein neuer Besucher sieht keinen fremden Entwurf", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/song/geburtstag");
  await expect(page.getByLabel("Für wen ist der Song?").filter({ visible: true })).toHaveValue("");
  await context.close();
});

test("Unbekannter Anlass zeigt die Fehlerseite", async ({ page }) => {
  await page.goto("/song/gibt-es-nicht");
  await expect(page.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
});
