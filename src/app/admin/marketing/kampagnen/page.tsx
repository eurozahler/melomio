import { Suspense } from "react";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { listLandingPages } from "@/marketing/landing";
import { listAdCosts } from "@/marketing/stats";
import { requireAdmin } from "@/server/admin";
import { ActionButton } from "../../admin-ui";
import { deleteAdCostAction, saveAdCostAction } from "../actions";
import { AdCostForm, LinkBuilder } from "./campaign-tools";

/** Werbekosten je Monat eintragen und Kampagnen-Links bauen. */
export default function Campaigns() {
  return (
    <Suspense fallback={null}>
      <CampaignsContent />
    </Suspense>
  );
}

async function CampaignsContent() {
  await requireAdmin("/admin/marketing/kampagnen");
  const db = getDb();
  const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()).slice(0, 7);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const yearAgo = `${y - 1}-${String(m).padStart(2, "0")}`;
  const [costs, landings] = await Promise.all([listAdCosts(db, yearAgo, month), listLandingPages(db)]);
  const euro = (c: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100);
  const pages = landings
    .filter((l) => l.landing)
    .map((l) => ({
      slug: l.landing!.slug,
      name: l.occasionName,
      published: l.landing!.published,
      variants: l.landing!.variants.map((v) => v.key),
    }));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Werbekosten &amp; Links</h1>
        <h2 className="text-xl font-bold">Link-Baukasten</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Baue den Link für eine Anzeige oder einen Post. So erkennt die Auswertung, woher Käufer kommen. Bei
          Google Ads hängt Google zusätzlich automatisch eine Klick-Kennung (gclid) an – das funktioniert auch
          ohne Baukasten.
        </p>
        <LinkBuilder baseUrl={getEnv().APP_BASE_URL} pages={pages} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Werbekosten</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Trage die Kosten aus deinem Werbekonto je Monat ein (z. B. aus Google Ads unter „Kampagnen“). Quelle
          und Kampagne müssen so heißen wie im Link (utm_source / utm_campaign). Ohne Kampagne gelten die
          Kosten für die ganze Quelle.
        </p>
        <AdCostForm month={month} save={saveAdCostAction} />
        {costs.length === 0 ? (
          <p className="text-sm text-neutral-500">Noch keine Kosten eingetragen.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="adcost-list">
            {costs
              .slice()
              .reverse()
              .map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800"
                >
                  <span>
                    <strong>{c.month}</strong> · {c.source}
                    {c.campaign && ` · ${c.campaign}`} · <strong>{euro(c.costCents)}</strong>
                    {c.note && <span className="text-neutral-500"> · {c.note}</span>}
                  </span>
                  <ActionButton
                    label="Löschen"
                    variant="secondary"
                    confirmText="Diesen Kosteneintrag löschen?"
                    action={deleteAdCostAction.bind(null, c.id)}
                  />
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
