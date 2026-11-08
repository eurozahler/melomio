import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getEnv } from "@/config/env";

/**
 * Gut sichtbares Banner, solange die App im Testbetrieb läuft oder ein Test-Adapter aktiv ist
 * (docs/ARCHITEKTUR.md, Abschnitt 4, Regel 1).
 *
 * `connection()` sorgt dafür, dass der Modus bei jedem Aufruf neu gelesen wird
 * und nicht beim Bauen der App in die Seite „eingefroren“ wird.
 */
export async function TestModeBanner() {
  await connection();
  const env = getEnv();
  if (!env.isTestOperation) return null;

  const t = await getTranslations("TestBanner");
  return (
    <div
      role="status"
      data-testid="test-mode-banner"
      className="sticky top-0 z-50 w-full bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-black shadow"
    >
      <span className="tracking-wider">{t("title")}</span> – {t("text")}
      {env.activeMocks.length > 0 && (
        <span className="hidden text-xs font-normal opacity-80 sm:block">
          {t("mocks", { list: env.activeMocks.join(", ") })}
        </span>
      )}
    </div>
  );
}
