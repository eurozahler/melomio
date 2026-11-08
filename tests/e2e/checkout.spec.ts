import { expect, test } from "@playwright/test";
import { linkFromMailbox, orderWithPreview, uniqueEmail } from "./helpers";

/** Abnahme M7: Hörprobe → Haken setzen → Testzahlung → Status „bezahlt“ → Bestellbestätigung. */

const PASSWORD = "Sommer-Lied-2026";
const status = (page: import("@playwright/test").Page) =>
  page.getByTestId("order-status").filter({ visible: true });

test("Kaufen mit Testzahlung: bezahlt und Bestellbestätigung mit Widerrufsverzicht", async ({ page }) => {
  const email = uniqueEmail("kauf");
  const ref = await orderWithPreview(page, email, PASSWORD);

  await expect(page.getByTestId("checkout-price")).toHaveText(/9,99\s€/);
  await expect(page.getByText(/inkl\. 19 % MwSt\. \(1,60\s€\)/)).toBeVisible();

  // Haken sind NICHT vorangekreuzt; ohne beide geht es nicht weiter
  const terms = page.getByRole("checkbox", { name: /AGB/ });
  const waiver = page.getByRole("checkbox", { name: /Widerrufsrecht verliere/ });
  await expect(terms).not.toBeChecked();
  await expect(waiver).not.toBeChecked();
  await page.getByRole("button", { name: "Zahlungspflichtig bestellen" }).click();
  await expect(page.getByText("Bitte bestätige beide Punkte, um fortzufahren.")).toBeVisible();
  await terms.check();
  await page.getByRole("button", { name: "Zahlungspflichtig bestellen" }).click();
  await expect(page.getByText("Bitte bestätige beide Punkte, um fortzufahren.")).toBeVisible();
  await waiver.check();
  await page.getByRole("button", { name: "Zahlungspflichtig bestellen" }).click();

  // Test-Bezahlseite (spielt Mollie)
  await expect(page).toHaveURL(/\/dev\/zahlung\/mock_/);
  await expect(page.getByTestId("mock-amount")).toHaveText(/9,99\s€/);
  await page.getByRole("button", { name: "Zahlung erfolgreich" }).click();

  await expect(page).toHaveURL(new RegExp(`/bestellung/${ref}[?]zahlung=zurueck`));
  await expect(status(page)).toHaveText("Bezahlt");
  await expect(page.getByText(/Vielen Dank! Deine Zahlung ist eingegangen\./)).toBeVisible();

  // Bestellbestätigung im Test-Postfach (vom Worker verschickt)
  const link = await linkFromMailbox(page, email, new RegExp(`Deine Bestellung ${ref}`));
  expect(link).toContain(`/bestellung/${ref}`);
  const mail = page
    .getByTestId("mail")
    .filter({ hasText: `Deine Bestellung ${ref}` })
    .first();
  await expect(mail).toContainText("dadurch mein Widerrufsrecht verliere");
  await expect(mail).toContainText("19 % MwSt.");
});

test("Fehlgeschlagene Zahlung: zurück zur Hörprobe mit Hinweis, erneuter Versuch möglich", async ({
  page,
}) => {
  const ref = await orderWithPreview(page, uniqueEmail("abbruch"), PASSWORD);
  await page.getByRole("checkbox", { name: /AGB/ }).check();
  await page.getByRole("checkbox", { name: /Widerrufsrecht verliere/ }).check();
  await page.getByRole("button", { name: "Zahlungspflichtig bestellen" }).click();
  await page.getByRole("button", { name: "Zahlung fehlgeschlagen" }).click();

  await expect(page).toHaveURL(new RegExp(`/bestellung/${ref}[?]zahlung=zurueck`));
  await expect(status(page)).toHaveText("Hörprobe bereit");
  await expect(page.getByText(/Die Zahlung hat nicht geklappt/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Zahlungspflichtig bestellen" })).toBeVisible();
});

test("Gefälschter Webhook wird angenommen, bewirkt aber nichts", async ({ request }) => {
  const res = await request.post("/api/webhooks/zahlung", { form: { id: "tr_gefaelscht123" } });
  expect(res.status()).toBe(200);
});
