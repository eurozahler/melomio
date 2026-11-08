import { expect, test } from "@playwright/test";
import {
  fillBirthdayQuestionnaire,
  linkFromMailbox,
  logout,
  registerAndVerify,
  uniqueEmail,
} from "./helpers";

/** Abnahme M3b: Kundenkonto mit E-Mail + Passwort und E-Mail-Link (F-16). */

const PASSWORD = "Sommer-Lied-2026";

test("Fragebogen → registrieren → E-Mail bestätigen → Bestellung läuft automatisch los", async ({ page }) => {
  const email = uniqueEmail("reg");
  await fillBirthdayQuestionnaire(page);

  await page.getByRole("button", { name: "Weiter zur Anmeldung" }).click();
  // Erster Aufruf nach dem Serverstart kann etwas dauern (Verbindungen werden aufgebaut)
  await expect(page).toHaveURL(/\/anmelden\?next=%2Fsong%2Fgeburtstag%2Fweiter/, { timeout: 15_000 });

  await page.getByRole("link", { name: "Mit Passwort registrieren" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Konto erstellen");
  await page.getByLabel("Vorname").filter({ visible: true }).fill("Mia");
  await page.getByLabel("E-Mail-Adresse").filter({ visible: true }).fill(email);
  await page.getByLabel("Passwort").filter({ visible: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Registrieren" }).click();
  await expect(page.getByText("Fast geschafft!")).toBeVisible();

  // Ohne bestätigte E-Mail keine Anmeldung (die Bestätigungs-E-Mail wird dabei erneut verschickt)
  await page.goto("/anmelden?next=%2Fsong%2Fgeburtstag%2Fweiter");
  await page.getByRole("tab", { name: "Mit Passwort" }).click();
  await page.getByLabel("E-Mail-Adresse").filter({ visible: true }).fill(email);
  await page.getByLabel("Passwort").filter({ visible: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(
    page.getByText("Bitte bestätige zuerst deine E-Mail-Adresse.", { exact: false }),
  ).toBeVisible();

  // Bestätigungslink aus dem Test-Postfach → automatisch angemeldet → Entwurf im Konto
  const link = await linkFromMailbox(page, email, /bestätige deine E-Mail/);
  expect(link).toContain("callbackURL=%2Fsong%2Fgeburtstag%2Fweiter");
  await page.goto(link);
  await expect(page).toHaveURL(/\/konto\?bestellung=M-/);
  await expect(page.getByTestId("signed-in-as")).toContainText(email);
  await expect(page.getByText(/Deine Bestellung M-[A-Z0-9]{6} ist angelegt/)).toBeVisible();

  // Abnahme M4: Der Status wechselt sichtbar automatisch weiter (Worker im Hintergrund)
  await expect(page.getByTestId("order-status")).toHaveText("Songtext bereit zur Prüfung", {
    timeout: 30_000,
  });

  // Der Entwurf ist verbraucht – ein erneuter Aufruf legt keine zweite Bestellung an
  await page.goto("/song/geburtstag/weiter");
  await expect(page).toHaveURL(/\/konto$/);
  await expect(page.getByTestId("order")).toHaveCount(1);
});

test("Anmelden mit E-Mail-Link ohne Passwort (legt das Konto an)", async ({ page }) => {
  const email = uniqueEmail("link");
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail-Adresse").filter({ visible: true }).fill(email);
  await page.getByRole("button", { name: "Link senden" }).click();
  await expect(page.getByText("Schau in dein Postfach")).toBeVisible();

  const link = await linkFromMailbox(page, email, /Anmeldelink/);
  await page.goto(link);
  await expect(page).toHaveURL(/\/konto/);
  await expect(page.getByTestId("signed-in-as")).toContainText(email);

  // Ein Anmeldelink funktioniert nur einmal
  await logout(page);
  await page.goto(link);
  await expect(page).toHaveURL(/\/anmelden\?fehler=link/);
  await expect(page.getByText("Der Anmeldelink ist abgelaufen oder wurde schon benutzt.")).toBeVisible();
});

test("Passwort vergessen und neu festlegen", async ({ page }) => {
  const email = uniqueEmail("reset");
  await registerAndVerify(page, email, PASSWORD);
  await expect(page.getByTestId("signed-in-as")).toContainText(email);
  await logout(page);

  await page.goto("/passwort-vergessen");
  await page.getByLabel("E-Mail-Adresse").filter({ visible: true }).fill(email);
  await page.getByRole("button", { name: "Link anfordern" }).click();
  await expect(page.getByText("Falls ein Konto mit dieser Adresse existiert")).toBeVisible();

  const link = await linkFromMailbox(page, email, /Neues Passwort/);
  await page.goto(link);
  await expect(page).toHaveURL(/\/passwort-neu\?token=/);
  await page.getByLabel("Passwort").filter({ visible: true }).fill("Neues-Passwort-42");
  await page.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(page.getByText("Dein Passwort wurde geändert.")).toBeVisible();

  // Altes Passwort geht nicht mehr, neues schon
  await page.goto("/anmelden");
  await page.getByRole("tab", { name: "Mit Passwort" }).click();
  await page.getByLabel("E-Mail-Adresse").filter({ visible: true }).fill(email);
  await page.getByLabel("Passwort").filter({ visible: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByText("E-Mail-Adresse oder Passwort stimmt nicht.")).toBeVisible();
  await page.getByLabel("Passwort").filter({ visible: true }).fill("Neues-Passwort-42");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).toHaveURL(/\/konto/);
});

test("Ohne Anmeldung kein Zugriff auf das Konto", async ({ page }) => {
  await page.goto("/konto");
  await expect(page).toHaveURL(/\/anmelden\?next=%2Fkonto/);
});

test("Nach dem Abmelden sieht die nächste Person am selben Gerät den Entwurf nicht", async ({ page }) => {
  const email = uniqueEmail("shared");
  await fillBirthdayQuestionnaire(page, "Geheimname");
  await page.getByRole("button", { name: "Weiter zur Anmeldung" }).click();
  await page.getByRole("link", { name: "Mit Passwort registrieren" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Konto erstellen");
  await page.getByLabel("E-Mail-Adresse").filter({ visible: true }).fill(email);
  await page.getByLabel("Passwort").filter({ visible: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Registrieren" }).click();
  await expect(page.getByText("Fast geschafft!")).toBeVisible();
  await page.goto(await linkFromMailbox(page, email, /bestätige deine E-Mail/));
  await expect(page).toHaveURL(/\/konto/);

  await logout(page);
  await page.goto("/song/geburtstag");
  await expect(page.getByLabel("Für wen ist der Song?").filter({ visible: true })).toHaveValue("");
});

test("Entwurf landet auch im Konto, wenn die Bestätigung über die normale Anmeldung kommt", async ({
  page,
}) => {
  const email = uniqueEmail("detour");
  await fillBirthdayQuestionnaire(page, "Umweg");
  await page.getByRole("button", { name: "Weiter zur Anmeldung" }).click();
  await page.getByRole("link", { name: "Mit Passwort registrieren" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Konto erstellen");
  await page.getByLabel("E-Mail-Adresse").filter({ visible: true }).fill(email);
  await page.getByLabel("Passwort").filter({ visible: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Registrieren" }).click();
  await expect(page.getByText("Fast geschafft!")).toBeVisible();

  // Kunde versucht sich über die normale Anmeldeseite anzumelden → neuer Bestätigungslink mit Ziel „Konto“
  await page.goto("/anmelden");
  await page.getByRole("tab", { name: "Mit Passwort" }).click();
  await page.getByLabel("E-Mail-Adresse").filter({ visible: true }).fill(email);
  await page.getByLabel("Passwort").filter({ visible: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(
    page.getByText("Bitte bestätige zuerst deine E-Mail-Adresse.", { exact: false }),
  ).toBeVisible();

  const link = await linkFromMailbox(page, email, /bestätige deine E-Mail/);
  expect(link).toContain("callbackURL=%2Fkonto");
  await page.goto(link);
  await expect(page).toHaveURL(/\/konto/);
  await expect(page.getByRole("link", { name: "Weiterbearbeiten" })).toBeVisible();
});
