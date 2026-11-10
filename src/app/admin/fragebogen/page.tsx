import Link from "next/link";
import { Suspense } from "react";
import { listOccasionsAdmin } from "@/admin/questionnaire";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/server/admin";
import { createOccasionAction } from "./actions";
import { NewOccasionForm } from "./builder-ui";

export default function AdminQuestionnaires() {
  return (
    <Suspense fallback={null}>
      <List />
    </Suspense>
  );
}

async function List() {
  await requireAdmin("/admin/fragebogen");
  const rows = await listOccasionsAdmin(getDb());
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Fragebögen</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Jeder Anlass hat einen Fragebogen. Änderungen entstehen als Entwurf und gelten erst nach
          „Veröffentlichen“ – bestehende Bestellungen behalten ihre Fassung.
        </p>
      </div>
      <ul className="flex flex-col gap-2" data-testid="occasion-list">
        {rows.map((o) => (
          <li
            key={o.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800"
          >
            <div>
              <Link href={`/admin/fragebogen/${o.slug}`} className="font-semibold text-brand">
                {o.name.de}
              </Link>
              <span className="ml-2 font-mono text-xs text-neutral-500">/song/{o.slug}</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span
                className={`rounded px-1.5 ${o.active ? "bg-green-100 text-green-900" : "bg-neutral-200 text-neutral-700"}`}
              >
                {o.active ? "sichtbar" : "ausgeblendet"}
              </span>
              <span className="rounded bg-neutral-100 px-1.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {o.publishedVersion ? `Fassung ${o.publishedVersion}` : "nicht veröffentlicht"}
              </span>
              {o.hasDraft && <span className="rounded bg-amber-100 px-1.5 text-amber-900">Entwurf</span>}
              <span className="text-neutral-500">{o.orders} Bestellungen</span>
            </div>
          </li>
        ))}
      </ul>
      <section>
        <h2 className="mb-2 text-xl font-bold">Neuer Anlass</h2>
        <NewOccasionForm create={createOccasionAction} />
      </section>
    </div>
  );
}
