import { Suspense } from "react";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { getMarketingConfig } from "@/marketing/config";
import { requireAdmin } from "@/server/admin";
import { saveMarketingConfigAction } from "../actions";
import { GoogleForm } from "./google-form";

/** Google Ads (Kauf-Messung mit Cookie-Banner) und Google Search Console einrichten. */
export default function GoogleSettings() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireAdmin("/admin/marketing/google");
  const config = await getMarketingConfig(getDb());
  const base = getEnv().APP_BASE_URL;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Google</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Wenn Google Ads eingeschaltet ist, sehen Besucher ein Cookie-Banner. Nur wer zustimmt, bekommt den
          Google-Code; Käufe dieser Besucher meldet melomio an Google Ads (Wert netto, Bestellnummer). Die eigene
          Auswertung zählt alle Besucher – auch ohne Zustimmung.
        </p>
      </div>
      <GoogleForm initial={config} save={saveMarketingConfigAction} />

      <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        <h2 className="text-lg font-bold">So findest du die Werte in Google Ads</h2>
        <ol className="list-decimal space-y-1 pl-5 text-neutral-700 dark:text-neutral-300">
          <li>
            Google Ads öffnen → <strong>Ziele</strong> → <strong>Conversions</strong> → <strong>Neue
            Conversion-Aktion</strong> → <strong>Website</strong>.
          </li>
          <li>
            Adresse <code>{base}</code> eingeben, dann <strong>Conversion-Aktion manuell mit Code erstellen</strong>.
          </li>
          <li>
            Kategorie <strong>Kauf</strong>, Wert: <strong>Für jede Conversion unterschiedliche Werte</strong>,
            Zählung: <strong>Jede</strong>.
          </li>
          <li>
            Unter <strong>Google-Tag einrichten</strong> → <strong>Selbst installieren</strong>: Im Event-Snippet
            steht <code>&apos;send_to&apos;: &apos;AW-123456789/AbC-dEfGhIj&apos;</code>. Der Teil vor dem
            Schrägstrich ist die <strong>Google-Ads-ID</strong>, der Teil danach das{" "}
            <strong>Conversion-Label</strong>. Den Code selbst musst du nirgends einbauen – das macht melomio.
          </li>
          <li>
            In Google Ads unter <strong>Verwaltung → Kontoeinstellungen</strong> die <strong>automatische
            Tag-Kennzeichnung</strong> eingeschaltet lassen (gclid).
          </li>
        </ol>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        <h2 className="text-lg font-bold">Google Search Console (Suche)</h2>
        <p className="text-neutral-700 dark:text-neutral-300">
          Zeigt, bei welchen Suchbegriffen melomio erscheint und wie oft geklickt wird – kostenlos und ohne Cookies.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-neutral-700 dark:text-neutral-300">
          <li>
            <a className="underline" href="https://search.google.com/search-console" target="_blank" rel="noreferrer">
              search.google.com/search-console
            </a>{" "}
            öffnen → Property hinzufügen → <strong>URL-Präfix</strong> <code>{base}</code>.
          </li>
          <li>
            Bestätigungsmethode <strong>HTML-Tag</strong>: aus{" "}
            <code>&lt;meta name=&quot;google-site-verification&quot; content=&quot;XYZ&quot;&gt;</code> nur{" "}
            <code>XYZ</code> oben eintragen, speichern, dann bei Google auf <strong>Bestätigen</strong>.
          </li>
          <li>
            Danach unter <strong>Sitemaps</strong> <code>sitemap.xml</code> einreichen.
          </li>
        </ol>
        <p className="text-xs text-neutral-500">
          Hinweis: Im Testbetrieb (staging) sperrt melomio Suchmaschinen aus. Die Search Console erst für die echte
          Adresse einrichten.
        </p>
      </section>
    </div>
  );
}
