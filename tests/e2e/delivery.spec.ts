import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { linkFromMailbox, orderWithPreview, registerAndVerify, uniqueEmail } from "./helpers";

/** Abnahme M9: Song und Video herunterladen, Song-Seite per Link/QR, E-Mail „Song fertig“. */

const PASSWORD = "Sommer-Lied-2026";
const status = (page: Page) => page.getByTestId("order-status").filter({ visible: true });

async function buy(page: Page, ref: string) {
  await page.getByRole("checkbox", { name: /AGB/ }).check();
  await page.getByRole("checkbox", { name: /Widerrufsrecht verliere/ }).check();
  await page.getByRole("button", { name: "Zahlungspflichtig bestellen" }).click();
  await page.getByRole("button", { name: "Zahlung erfolgreich" }).click();
  await expect(page).toHaveURL(new RegExp(`/bestellung/${ref}[?]zahlung=zurueck`));
  await expect(status(page)).toHaveText("Fertig", { timeout: 120_000 });
}

test("Von der Bestellung bis zum Download – und Song-Seite zum Teilen", async ({
  page,
  browser,
  playwright,
}) => {
  test.setTimeout(240_000);
  const email = uniqueEmail("download");
  const ref = await orderWithPreview(page, email, PASSWORD);

  // Ein Foto für die Slideshow hochladen (wird vor dem Kauf angezeigt)
  const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#cc6633" } })
    .jpeg()
    .toBuffer();
  await page
    .getByTestId("photo-input")
    .setInputFiles({ name: "urlaub.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.getByTestId("photo-list").getByRole("img")).toHaveCount(1);
  // Kein Bild: wird abgelehnt
  await page
    .getByTestId("photo-input")
    .setInputFiles({ name: "text.jpg", mimeType: "image/jpeg", buffer: Buffer.from("kein Bild") });
  await expect(page.getByRole("alert").filter({ hasText: "kein unterstütztes Bild" })).toBeVisible();

  await buy(page, ref);

  await expect(page.getByText("Dein Song ist fertig! 🎉")).toBeVisible();
  await expect(page.getByTestId("song-audio")).toBeVisible();
  await expect(page.getByTestId("song-video")).toBeVisible();

  // Downloads über signierte Links
  const songHref = (await page.getByTestId("download-song").getAttribute("href"))!;
  const videoHref = (await page.getByTestId("download-video").getAttribute("href"))!;
  const song = await page.request.get(songHref);
  expect(song.status()).toBe(200);
  expect(song.headers()["content-type"]).toBe("audio/mpeg");
  expect(song.headers()["content-disposition"]).toContain(`attachment; filename="melomio-${ref}.mp3"`);
  expect((await song.body()).length).toBeGreaterThan(1_000_000); // ganzer Song, nicht die Hörprobe
  const video = await page.request.get(videoHref);
  expect(video.status()).toBe(200);
  expect(video.headers()["content-type"]).toBe("video/mp4");

  // Rechnung (PDF) nur für das eigene Konto
  const invoiceLink = page.getByTestId("invoices").getByRole("link");
  await expect(invoiceLink).toHaveText(/^Rechnung TEST-RE-\d{4}-\d{5} \(PDF\)$/);
  const invoiceHref = (await invoiceLink.getAttribute("href"))!;
  const invoice = await page.request.get(invoiceHref);
  expect(invoice.status()).toBe(200);
  expect(invoice.headers()["content-type"]).toBe("application/pdf");
  expect((await invoice.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Manipulierter Link → ungültig
  expect((await page.request.get(songHref.replace(/sig=[^&]+/, "sig=falsch"))).status()).toBe(403);
  expect((await page.request.get(songHref.replace(/exp=\d+/, "exp=9999999999"))).status()).toBe(403);

  // Gültiger Link, aber nicht angemeldet → kein Download
  const origin = new URL(page.url()).origin;
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  expect((await anonymous.get(songHref)).status()).toBe(401);

  // Fremdes Konto mit gültigem Link → nichts
  const other = await browser.newContext();
  const stranger = await other.newPage();
  await registerAndVerify(stranger, uniqueEmail("fremd"), PASSWORD);
  expect((await stranger.request.get(songHref)).status()).toBe(404);
  expect((await stranger.request.get(invoiceHref)).status()).toBe(404);
  await other.close();

  // Song-Seite einschalten → öffentlich erreichbar, mit QR-Code
  await page.getByRole("button", { name: "Song-Seite einschalten" }).click();
  const shareUrl = (await page.getByTestId("share-url").textContent())!;
  expect(shareUrl).toMatch(/\/s\/[A-Za-z0-9_-]{32}$/);
  await expect(page.getByRole("img", { name: "QR-Code zur Song-Seite" })).toBeVisible();

  const visitor = await browser.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(shareUrl);
  await expect(visitorPage.getByTestId("share-title")).toBeVisible();
  const token = shareUrl.split("/s/")[1];
  expect((await visitorPage.request.get(`/api/teilen/${token}/song`)).status()).toBe(200);

  // Abschalten → Link tot
  await page.getByRole("button", { name: "Song-Seite abschalten" }).click();
  await expect(page.getByRole("button", { name: "Song-Seite einschalten" })).toBeVisible();
  await visitorPage.goto(shareUrl);
  await expect(visitorPage.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
  expect((await visitorPage.request.get(`/api/teilen/${token}/song`)).status()).toBe(404);
  await visitor.close();
  await anonymous.dispose();

  // E-Mail „Dein Song ist fertig“ mit Link zur Bestellung
  const link = await linkFromMailbox(page, email, /Dein Song ist fertig/);
  expect(link).toContain(`/bestellung/${ref}`);
});
