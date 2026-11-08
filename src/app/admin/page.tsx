import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getKpis, listOrders } from "@/admin/service";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/server/admin";

export default function AdminHome() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}

function Kpi({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 text-3xl font-bold" data-testid={testId}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

async function Dashboard() {
  await requireAdmin("/admin");
  const db = getDb();
  const [k, attention, tStatus] = await Promise.all([
    getKpis(db),
    listOrders(db, { status: "attention" }, 10),
    getTranslations("OrderStatus"),
  ]);
  const euro = (cents: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold tracking-tight">Übersicht</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Hörproben heute"
          value={String(k.previewsToday)}
          hint={`insgesamt ${k.previewsTotal}`}
          testId="kpi-previews"
        />
        <Kpi
          label="Käufe heute"
          value={String(k.paidToday)}
          hint={`insgesamt ${k.paidTotal}`}
          testId="kpi-paid"
        />
        <Kpi
          label="Kaufquote"
          value={k.conversion === null ? "–" : `${Math.round(k.conversion * 100)} %`}
          hint="Käufe ÷ Hörproben (gesamt)"
          testId="kpi-conversion"
        />
        <Kpi
          label="Geschätzte Hörproben-Kosten"
          value={euro(k.previewCostCents)}
          hint="Musikanbieter, gesamt"
        />
        <Kpi
          label="Braucht Aufmerksamkeit"
          value={String(k.needsAttention)}
          hint="Fehler oder manuelle Prüfung"
          testId="kpi-attention"
        />
      </div>

      <section>
        <h2 className="mb-3 text-xl font-bold">Braucht Aufmerksamkeit</h2>
        {attention.length === 0 ? (
          <p className="text-neutral-500">Alles in Ordnung.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {attention.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <Link
                  href={`/admin/bestellungen/${o.publicRef}`}
                  className="font-mono font-semibold text-brand"
                >
                  {o.publicRef}
                </Link>
                <span>{tStatus(o.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
