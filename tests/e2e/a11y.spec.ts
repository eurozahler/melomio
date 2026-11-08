import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { orderWithPreview, uniqueEmail } from "./helpers";

/**
 * Abnahme M11: automatische Barrierefreiheitsprüfung (axe, WCAG 2.1 A/AA) der wichtigsten Seiten.
 * Automatische Prüfungen finden nur einen Teil der Probleme – eine Prüfung von Hand bleibt nötig.
 */

const PASSWORD = "Sommer-Lied-2026";

async function expectNoViolations(page: Page, name: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Versteckt vorgehaltene Seiten (React Activity) nicht mitprüfen
    .exclude("[hidden]")
    .analyze();
  const summary = result.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help} – ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(summary, `Barrierefreiheit auf „${name}“`).toEqual([]);
}

test("öffentliche Seiten", async ({ page }) => {
  for (const [path, name] of [
    ["/", "Startseite"],
    ["/anmelden", "Anmelden"],
    ["/registrieren", "Registrieren"],
    ["/agb", "AGB"],
    ["/song/geburtstag", "Fragebogen"],
  ] as const) {
    await page.goto(path);
    await expectNoViolations(page, name);
  }
});

test("Bestellung mit Songtext und Hörprobe", async ({ page }) => {
  test.setTimeout(180_000);
  const ref = await orderWithPreview(page, uniqueEmail("a11y"), PASSWORD);
  await expectNoViolations(page, "Bestellung mit Hörprobe");
  await page.goto(`/bestellung/${ref}/songtext`);
  await expectNoViolations(page, "Songtext");
  await page.goto("/konto");
  await expectNoViolations(page, "Konto");
});
