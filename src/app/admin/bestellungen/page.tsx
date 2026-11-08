import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { listOrders, type OrderFilter } from "@/admin/service";
import { getDb } from "@/db/client";
import { ORDER_STATUSES, type OrderStatus } from "@/domain/order-status";
import { requireAdmin } from "@/server/admin";

export default function AdminOrders({ searchParams }: PageProps<"/admin/bestellungen">) {
  return (
    <Suspense fallback={null}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({ searchParams }: Pick<PageProps<"/admin/bestellungen">, "searchParams">) {
  await requireAdmin("/admin/bestellungen");
  const p = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const statusParam = one(p.status);
  const filter: OrderFilter = {
    status:
      statusParam === "attention" || (ORDER_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as OrderStatus | "attention")
        : null,
    test: one(p.modus) === "test" || one(p.modus) === "live" ? (one(p.modus) as "test" | "live") : null,
    q: one(p.q).slice(0, 100) || null,
  };
  const [rows, tStatus] = await Promise.all([listOrders(getDb(), filter), getTranslations("OrderStatus")]);
  const input =
    "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
  const date = (d: Date) =>
    d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold tracking-tight">Bestellungen</h1>
      <form className="flex flex-wrap gap-2" method="get">
        <input
          name="q"
          defaultValue={filter.q ?? ""}
          placeholder="Bestellnummer oder E-Mail"
          className={input}
          aria-label="Suche"
        />
        <select name="status" defaultValue={statusParam} className={input} aria-label="Status">
          <option value="">Alle Status</option>
          <option value="attention">Braucht Aufmerksamkeit</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </select>
        <select name="modus" defaultValue={one(p.modus)} className={input} aria-label="Testbestellung">
          <option value="">Test und echt</option>
          <option value="test">Nur Testbestellungen</option>
          <option value="live">Nur echte Bestellungen</option>
        </select>
        <button className="rounded-lg bg-brand-strong px-4 py-2 text-sm font-semibold text-white">
          Filtern
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2">Nr.</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Kunde</th>
              <th className="px-3 py-2">Angelegt</th>
              <th className="px-3 py-2">Bezahlt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((o) => (
              <tr key={o.id} data-testid="admin-order-row">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/bestellungen/${o.publicRef}`}
                    className="font-mono font-semibold text-brand"
                  >
                    {o.publicRef}
                  </Link>
                  {o.isTest && (
                    <span className="ml-2 rounded bg-amber-200 px-1.5 text-xs text-amber-900">TEST</span>
                  )}
                </td>
                <td className="px-3 py-2">{tStatus(o.status)}</td>
                <td className="px-3 py-2">{o.email}</td>
                <td className="px-3 py-2 whitespace-nowrap">{date(o.createdAt)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{o.paidAt ? date(o.paidAt) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-neutral-500">Keine Bestellungen gefunden.</p>}
      </div>
    </div>
  );
}
