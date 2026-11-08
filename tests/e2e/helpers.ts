import { expect, type Page } from "@playwright/test";

export const heading = (page: Page) => page.getByRole("heading", { level: 1 });
export const next = (page: Page) => page.getByRole("button", { name: "Weiter", exact: true });

/** Eindeutige Test-E-Mail-Adresse (Domain .invalid kann nie zugestellt werden). */
export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.invalid`;
}

/** Füllt den Geburtstags-Fragebogen vollständig aus und endet auf der Zusammenfassung. */
export async function fillBirthdayQuestionnaire(page: Page, name = "Anna") {
  await page.goto("/song/geburtstag");
  await page.getByLabel("Für wen ist der Song?").filter({ visible: true }).fill(name);
  await next(page).click();
  await page.getByRole("radio", { name: "Freund/in" }).check();
  await next(page).click();
  await page.getByRole("radio", { name: "Nein" }).check();
  await next(page).click();
  await page
    .getByLabel("Was macht diese Person besonders?")
    .filter({ visible: true })
    .fill("Sie lacht laut und liebt Kaffee.");
  await next(page).click();
  await next(page).click(); // Erinnerungen (freiwillig)
  await next(page).click(); // Absender (freiwillig)
  await page.getByRole("radio", { name: "Pop" }).check();
  await page.getByRole("radio", { name: "Fröhlich" }).check();
  await page.getByRole("radio", { name: "Warme Männerstimme" }).check();
  await next(page).click();
  await expect(heading(page)).toHaveText("Alles beisammen?");
}

/** Holt den ersten Link aus der neuesten E-Mail an diese Adresse im Test-Postfach. */
export async function linkFromMailbox(page: Page, email: string, subject: RegExp): Promise<string> {
  let href: string | null = null;
  await expect(async () => {
    await page.goto("/dev/mailbox");
    const mail = page.getByTestId("mail").filter({ hasText: email }).filter({ hasText: subject }).first();
    href = await mail.getByTestId("mail-link").first().getAttribute("href", { timeout: 1000 });
    expect(href).toBeTruthy();
  }).toPass({ timeout: 15_000 });
  return href!;
}

/** Registriert ein Konto mit Passwort und bestätigt die E-Mail über den Link im Test-Postfach. */
export async function registerAndVerify(page: Page, email: string, password: string, next = "/konto") {
  await page.goto(`/registrieren?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-Mail-Adresse").filter({ visible: true }).fill(email);
  await page.getByLabel("Passwort").filter({ visible: true }).fill(password);
  await page.getByRole("button", { name: "Registrieren" }).click();
  await expect(page.getByText("Fast geschafft!")).toBeVisible();
  const link = await linkFromMailbox(page, email, /bestätige deine E-Mail/);
  await page.goto(link);
}

export async function logout(page: Page) {
  await page.goto("/konto");
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page.getByTestId("header-account")).toHaveText("Anmelden");
}

/**
 * Kompletter Weg bis zur Bestellung: Fragebogen ausfüllen, registrieren, E-Mail bestätigen.
 * Endet in „Mein Konto“ mit einer neuen Bestellung; gibt die Bestellnummer zurück.
 */
export async function orderViaQuestionnaire(page: Page, email: string, password: string): Promise<string> {
  await fillBirthdayQuestionnaire(page);
  await page.getByRole("button", { name: "Weiter zur Anmeldung" }).click();
  await expect(page).toHaveURL(/\/anmelden/, { timeout: 15_000 });
  await page.getByRole("link", { name: "Mit Passwort registrieren" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Konto erstellen");
  await page.getByLabel("E-Mail-Adresse").filter({ visible: true }).fill(email);
  await page.getByLabel("Passwort").filter({ visible: true }).fill(password);
  await page.getByRole("button", { name: "Registrieren" }).click();
  await expect(page.getByText("Fast geschafft!")).toBeVisible();
  await page.goto(await linkFromMailbox(page, email, /bestätige deine E-Mail/));
  await expect(page).toHaveURL(/\/konto\?bestellung=M-/);
  return new URL(page.url()).searchParams.get("bestellung")!;
}

/** Bestellung bis zur fertigen Hörprobe: Fragebogen, Konto, Songtext freigeben, Musik abwarten. */
export async function orderWithPreview(page: Page, email: string, password: string): Promise<string> {
  const ref = await orderViaQuestionnaire(page, email, password);
  await expect(page.getByTestId("order-status").filter({ visible: true })).toHaveText(
    "Songtext bereit zur Prüfung",
    { timeout: 30_000 },
  );
  await page.goto(`/bestellung/${ref}/songtext`);
  await page.getByRole("button", { name: "Songtext freigeben" }).click();
  await page.getByRole("button", { name: "Ja, freigeben" }).click();
  await expect(page.getByText(/Songtext freigegeben\./)).toBeVisible();
  await page.goto(`/bestellung/${ref}`);
  await expect(page.getByTestId("order-status").filter({ visible: true })).toHaveText("Hörprobe bereit", {
    timeout: 90_000,
  });
  return ref;
}
