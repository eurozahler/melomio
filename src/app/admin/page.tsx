import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getKpis, getMonthlyStats, listOrders } from "@/admin/service";
import { getDb } from "@/db/client";
import { workerStatus } from "@/monitoring/watchdog";
import { requireAdmin } from "@/server/admin";

export default function AdminHome({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={null}>
      <Dashboard searchParams={searchParams} />
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

async function Dashboard({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  await requireAdmin("/admin");
  const db = getDb();
  const test = (await searchParams).modus === "test";
  const [k, attention, tStatus, months] = await Promise.all([
    getKpis(db),
    listOrders(db, { status: "attention" }, 10),
    getTranslations("OrderStatus"),
    getMonthlyStats(db, { test }),
  ]);
  const w = await workerStatus(db);
  const euro = (cents: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold tracking-tight">Übersicht</h1>
      <p
        data-testid="worker-status"
        className={`rounded-xl p-3 text-sm ${w.ok ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`}
      >
        {w.ok
          ? `✓ Hintergrund-Worker läuft (Stand ${w.version}, Lebenszeichen vor ${w.ageMin} Min.)`
          : w.ageMin !== null
            ? `⚠ Hintergrund-Worker meldet sich seit ${w.ageMin} Minuten nicht – Songs und Videos werden nicht erstellt.`
            : "⚠ Vom Hintergrund-Worker ist noch kein Lebenszeichen angekommen."}
      </p>
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
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">Monate {test ? "(Testbetrieb)" : "(Livebetrieb)"}</h2>
          <Link href={test ? "/admin" : "/admin?modus=test"} className="text-sm text-brand underline">
            {test ? "Livebetrieb anzeigen" : "Testbetrieb anzeigen"}
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm tabular-nums" data-testid="monthly-stats">
            <thead className="text-xs text-neutral-500 uppercase">
              <tr>
                <th className="py-2 pr-3 text-left">Monat</th>
                <th className="py-2 pr-3">Bestellungen</th>
                <th className="py-2 pr-3">Hörproben</th>
                <th className="py-2 pr-3">Käufe</th>
                <th className="py-2 pr-3">Umsatz brutto</th>
                <th className="py-2 pr-3">Erstattet</th>
                <th className="py-2 pr-3">Musikkosten</th>
                <th className="py-2 pr-3">Fehler</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-2 pr-3 text-left">{m.month.split("-").reverse().join("/")}</td>
                  <td className="py-2 pr-3">{m.orders}</td>
                  <td className="py-2 pr-3">{m.previews}</td>
                  <td className="py-2 pr-3">{m.paid}</td>
                  <td className="py-2 pr-3">{euro(m.revenueCents)}</td>
                  <td className="py-2 pr-3">{euro(m.refundedCents)}</td>
                  <td className="py-2 pr-3">{euro(m.musicCostCents)}</td>
                  <td className="py-2 pr-3">{m.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Musikkosten sind Schätzwerte (Mureka ca. 0,15 $ je Song). Songtext-Kosten (Claude) sind nicht
          enthalten.
        </p>
      </section>

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
