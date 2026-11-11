import { Suspense } from "react";
import { channelLabel } from "@/domain/attribution";
import { getDb } from "@/db/client";
import { getDailyVisits, getMarketingReport, MONTH_RE, type GroupBy, type ReportRow } from "@/marketing/stats";
import { requireAdmin } from "@/server/admin";

/** Auswertung: woher kommen Besucher, wer kauft, was kostet ein Kauf. */
export default function MarketingReport({ searchParams }: PageProps<"/admin/marketing">) {
  return (
    <Suspense fallback={null}>
      <Report searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const euro = (c: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10} %` : "–");
const intl = (n: number) => new Intl.NumberFormat("de-DE").format(n);

function currentMonth() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()).slice(0, 7);
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rowLabel(r: ReportRow, g: GroupBy) {
  if (g === "landing") {
    if (r.landing === "/") return "Startseite";
    if (r.landing === "(fragebogen)") return "Fragebogen geöffnet (alle)";
    if (!r.landing) return "ohne Landingpage";
    return r.landing;
  }
  const channel = channelLabel(r.source, r.medium);
  return g === "campaign" ? `${channel} · ${r.campaign || "(ohne Kampagne)"}` : channel;
}

async function Report({ searchParams }: Pick<PageProps<"/admin/marketing">, "searchParams">) {
  await requireAdmin("/admin/marketing");
  const p = await searchParams;
  const now = currentMonth();
  const to = MONTH_RE.test(one(p.bis)) ? one(p.bis) : now;
  const from = MONTH_RE.test(one(p.von)) && one(p.von) <= to ? one(p.von) : to;
  const g: GroupBy = one(p.nach) === "campaign" || one(p.nach) === "landing" ? (one(p.nach) as GroupBy) : "channel";
  const test = one(p.modus) === "test";
  const db = getDb();
  const [rows, daily] = await Promise.all([
    getMarketingReport(db, { fromMonth: from, toMonth: to, groupBy: g, test }),
    getDailyVisits(db, from, to),
  ]);

  const sum = (k: keyof ReportRow) => rows.reduce((s, r) => s + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  const totals = {
    visits: sum("visits"),
    starts: sum("starts"),
    orders: sum("orders"),
    previews: sum("previews"),
    paid: sum("paid"),
    revenue: sum("revenueNetCents"),
    cost: sum("costCents"),
  };
  const input =
    "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
  const presets = [
    { label: "Dieser Monat", von: now, bis: now },
    { label: "Letzter Monat", von: shiftMonth(now, -1), bis: shiftMonth(now, -1) },
    { label: "Letzte 3 Monate", von: shiftMonth(now, -2), bis: now },
    { label: "Letzte 12 Monate", von: shiftMonth(now, -11), bis: now },
  ];
  const qs = (o: Record<string, string>) =>
    `?${new URLSearchParams({ von: from, bis: to, nach: g, ...(test ? { modus: "test" } : {}), ...o })}`;

  const tiles = [
    { label: "Besuche", value: intl(totals.visits), hint: "Startseite + Landingpages" },
    { label: "Fragebogen geöffnet", value: intl(totals.starts), hint: pct(totals.starts, totals.visits) + " der Besuche" },
    { label: "Hörproben", value: intl(totals.previews), hint: `${intl(totals.orders)} Bestellungen angelegt` },
    { label: "Käufe", value: intl(totals.paid), hint: pct(totals.paid, totals.previews) + " der Hörproben" },
    { label: "Umsatz netto", value: euro(totals.revenue), hint: "ohne Erstattungen" },
    {
      label: "Werbekosten",
      value: euro(totals.cost),
      hint: totals.paid > 0 && totals.cost > 0 ? `${euro(Math.round(totals.cost / totals.paid))} pro Kauf` : "eingetragene Kosten",
    },
  ];

  const maxDay = Math.max(1, ...daily.map((d) => d.visits));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Auswertung</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Ohne Cookies gezählt: Besuche als Tagessummen, Bestellungen mit ihrer Herkunft (Werbung, Suche,
          Partner-Code …). Bestellungen zählen im Monat ihres Anlegens.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((pr) => (
          <a
            key={pr.label}
            href={qs({ von: pr.von, bis: pr.bis })}
            className={`rounded-full border px-3 py-1 text-sm ${pr.von === from && pr.bis === to ? "border-brand bg-brand/10 font-semibold" : "border-neutral-300 dark:border-neutral-700"}`}
          >
            {pr.label}
          </a>
        ))}
      </div>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Von
          <input type="month" name="von" defaultValue={from} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Bis
          <input type="month" name="bis" defaultValue={to} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Aufteilen nach
          <select name="nach" defaultValue={g} className={input}>
            <option value="channel">Herkunft</option>
            <option value="campaign">Kampagne</option>
            <option value="landing">Landingpage</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Bestellungen
          <select name="modus" defaultValue={test ? "test" : ""} className={input}>
            <option value="">Echte</option>
            <option value="test">Testbestellungen</option>
          </select>
        </label>
        <button className="rounded-lg bg-brand-strong px-4 py-2 text-sm font-semibold text-white">Anzeigen</button>
      </form>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="marketing-kpis">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <dt className="text-xs text-neutral-500">{t.label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{t.value}</dd>
            <dd className="mt-0.5 text-xs text-neutral-500">{t.hint}</dd>
          </div>
        ))}
      </dl>

      {/* Besuche je Tag – eine Reihe, daher ohne Legende; Werte per Hover und in der Tabelle */}
      <figure className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <figcaption className="text-sm font-semibold">Besuche je Tag</figcaption>
        {daily.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Im Zeitraum noch keine Besuche gezählt.</p>
        ) : (
          <>
            <div className="mt-3 flex h-32 items-end gap-0.5 border-b border-neutral-200 dark:border-neutral-800" role="img" aria-label="Balkendiagramm der Besuche je Tag">
              {daily.map((d) => (
                <div key={d.day} className="group relative flex h-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-[4px] bg-brand transition-opacity group-hover:opacity-80"
                    style={{ height: `${Math.max(2, (d.visits / maxDay) * 100)}%` }}
                  />
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-neutral-900 px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block">
                    {new Date(`${d.day}T12:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}:{" "}
                    {intl(d.visits)} Besuche · {intl(d.starts)} Fragebögen
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-neutral-500">
              <span>{new Date(`${daily[0]!.day}T12:00:00`).toLocaleDateString("de-DE")}</span>
              <span>höchstens {intl(maxDay)} am Tag</span>
              <span>{new Date(`${daily.at(-1)!.day}T12:00:00`).toLocaleDateString("de-DE")}</span>
            </div>
          </>
        )}
      </figure>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm tabular-nums" data-testid="marketing-table">
          <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2">{g === "landing" ? "Landingpage" : g === "campaign" ? "Kampagne" : "Herkunft"}</th>
              <th className="px-3 py-2 text-right">Besuche</th>
              <th className="px-3 py-2 text-right">Fragebogen</th>
              <th className="px-3 py-2 text-right">Bestellungen</th>
              <th className="px-3 py-2 text-right">Hörproben</th>
              <th className="px-3 py-2 text-right">Käufe</th>
              <th className="px-3 py-2 text-right">Kaufquote</th>
              <th className="px-3 py-2 text-right">Umsatz netto</th>
              <th className="px-3 py-2 text-right">Kosten</th>
              <th className="px-3 py-2 text-right">Kosten/Kauf</th>
              <th className="px-3 py-2 text-right">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-4 text-center text-neutral-500">
                  Noch keine Daten im Zeitraum.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.source}|${r.medium}|${r.campaign}|${r.landing}`} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-3 py-2 font-medium">{rowLabel(r, g)}</td>
                <td className="px-3 py-2 text-right">{intl(r.visits)}</td>
                <td className="px-3 py-2 text-right">{intl(r.starts)}</td>
                <td className="px-3 py-2 text-right">{intl(r.orders)}</td>
                <td className="px-3 py-2 text-right">{intl(r.previews)}</td>
                <td className="px-3 py-2 text-right font-semibold">{intl(r.paid)}</td>
                <td className="px-3 py-2 text-right">{pct(r.paid, r.previews)}</td>
                <td className="px-3 py-2 text-right">{euro(r.revenueNetCents)}</td>
                <td className="px-3 py-2 text-right">{r.costCents ? euro(r.costCents) : "–"}</td>
                <td className="px-3 py-2 text-right">
                  {r.costCents && r.paid ? euro(Math.round(r.costCents / r.paid)) : "–"}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.costCents ? `${(r.revenueNetCents / r.costCents).toFixed(1).replace(".", ",")} ×` : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        Kaufquote = Käufe ÷ Hörproben. ROAS = Umsatz netto ÷ Werbekosten (über 1 × heißt: die Werbung bringt
        mehr Umsatz, als sie kostet – Musik- und KI-Kosten sind noch nicht abgezogen). Werbekosten trägst du unter
        „Werbekosten &amp; Links“ je Monat ein.
      </p>
    </div>
  );
}
