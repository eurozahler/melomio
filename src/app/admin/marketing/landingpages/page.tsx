import { Suspense } from "react";
import Link from "next/link";
import { getDb } from "@/db/client";
import { listLandingPages } from "@/marketing/landing";
import { requireAdmin } from "@/server/admin";

/** Übersicht: eine Landingpage je Anlass. */
export default function LandingList() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireAdmin("/admin/marketing/landingpages");
  const rows = await listLandingPages(getDb());
  const badge = "rounded px-1.5 py-0.5 text-xs font-semibold";
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Landingpages</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Je Anlass eine eigene Seite für Google und Werbung (Adresse /lieder/…). Sobald du einen Anlass angelegt
          hast, kannst du hier die Seite schreiben – selbst oder mit KI-Entwurf – und veröffentlichen.
        </p>
      </div>
      <ul className="flex flex-col gap-2" data-testid="landing-list">
        {rows.map((r) => (
          <li
            key={r.occasionId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800"
          >
            <span className="flex flex-wrap items-center gap-2">
              <strong>{r.occasionName}</strong>
              {r.landing ? (
                <span className="text-neutral-500">/lieder/{r.landing.slug}</span>
              ) : (
                <span className="text-neutral-500">noch keine Seite</span>
              )}
              {r.landing?.published && <span className={`${badge} bg-green-100 text-green-800`}>Online</span>}
              {r.landing && !r.landing.published && (
                <span className={`${badge} bg-neutral-200 text-neutral-700`}>Entwurf</span>
              )}
              {!r.occasionActive && (
                <span className={`${badge} bg-amber-100 text-amber-900`}>Anlass inaktiv</span>
              )}
            </span>
            <span className="flex gap-2">
              {r.landing && (
                <Link
                  href={`/lieder/${r.landing.slug}`}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 font-semibold dark:border-neutral-700"
                  target="_blank"
                >
                  Ansehen
                </Link>
              )}
              <Link
                href={`/admin/marketing/landingpages/${r.occasionId}`}
                className="rounded-lg bg-brand-strong px-3 py-1.5 font-semibold text-white"
              >
                {r.landing ? "Bearbeiten" : "Seite anlegen"}
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
