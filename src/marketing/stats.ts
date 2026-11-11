import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/admin/service";
import type { Database } from "@/db/client";
import { adCosts, pageViewStats } from "@/db/schema";
import type { Attribution } from "@/domain/attribution";

/**
 * Auswertung ohne Cookies:
 * - Seitenaufrufe nur als Tagessummen je Seite und Herkunft
 * - Bestellungen tragen die Herkunft (orders.attribution), Partner-Codes überschreiben sie
 * - Werbekosten trägt der Admin je Monat ein
 */

/** Gezählt werden nur Startseite, Landingpages und der Fragebogen-Start. */
export function countablePath(path: string): string | null {
  const p = path.split("?")[0]!.replace(/\/+$/, "") || "/";
  if (p === "/") return "/";
  const m = /^\/(lieder|song)\/([a-z0-9-]{1,80})$/.exec(p);
  return m ? `/${m[1]}/${m[2]}` : null;
}

const BOT_RE = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly|monitor/i;
export const isBot = (userAgent: string | null) => !userAgent || BOT_RE.test(userAgent);

/** Berliner Kalendertag als YYYY-MM-DD. */
export function berlinDay(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);
}

export async function recordPageView(db: Database, path: string, a: Attribution, now = new Date()) {
  const p = countablePath(path);
  if (!p) return false;
  await db
    .insert(pageViewStats)
    .values({ day: berlinDay(now), path: p, source: a.source, medium: a.medium, campaign: a.campaign, views: 1 })
    .onConflictDoUpdate({
      target: [pageViewStats.day, pageViewStats.path, pageViewStats.source, pageViewStats.medium, pageViewStats.campaign],
      set: { views: sql`${pageViewStats.views} + 1` },
    });
  return true;
}

// --- Werbekosten --------------------------------------------------------------

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const adCostSchema = z.object({
  month: z.string().regex(MONTH_RE),
  source: z.string().trim().toLowerCase().min(1).max(80),
  campaign: z.string().trim().toLowerCase().max(150).default(""),
  costCents: z.number().int().min(0).max(100_000_000),
  note: z.string().trim().max(200).nullable().optional(),
});

export async function saveAdCost(db: Database, actorId: string, raw: unknown) {
  const parsed = adCostSchema.safeParse(raw);
  if (!parsed.success) return false;
  const v = parsed.data;
  await db
    .insert(adCosts)
    .values({ ...v, note: v.note ?? null, createdBy: actorId })
    .onConflictDoUpdate({
      target: [adCosts.month, adCosts.source, adCosts.campaign],
      set: { costCents: v.costCents, note: v.note ?? null, createdBy: actorId },
    });
  await audit(db, {
    actorUserId: actorId,
    action: "adcost.save",
    entity: "ad_cost",
    entityId: `${v.month}/${v.source}/${v.campaign}`,
    newValue: v.costCents,
  });
  return true;
}

export async function deleteAdCost(db: Database, actorId: string, id: string) {
  const [row] = await db.delete(adCosts).where(eq(adCosts.id, id)).returning();
  if (row)
    await audit(db, {
      actorUserId: actorId,
      action: "adcost.delete",
      entity: "ad_cost",
      entityId: `${row.month}/${row.source}/${row.campaign}`,
      oldValue: row.costCents,
    });
}

export async function listAdCosts(db: Database, fromMonth: string, toMonth: string) {
  return db
    .select()
    .from(adCosts)
    .where(and(sql`${adCosts.month} >= ${fromMonth}`, sql`${adCosts.month} <= ${toMonth}`))
    .orderBy(adCosts.month, adCosts.source, adCosts.campaign);
}

// --- Bericht ------------------------------------------------------------------

export type GroupBy = "channel" | "campaign" | "landing";

export type ReportRow = {
  source: string;
  medium: string;
  campaign: string;
  landing: string;
  visits: number;
  starts: number;
  orders: number;
  previews: number;
  paid: number;
  refunded: number;
  revenueNetCents: number;
  costCents: number;
};

const num = (v: unknown) => Number(v ?? 0);

/**
 * Trichter je Herkunft für einen Monatszeitraum (Berliner Zeit):
 * Besuche → Fragebogen geöffnet → Bestellung angelegt → Hörprobe → Kauf → Umsatz (netto, ohne Erstattungen).
 * Kosten gehören zu „<Quelle> / cpc“ (je Kampagne, wenn nach Kampagne gruppiert wird).
 */
export async function getMarketingReport(
  db: Database,
  opts: { fromMonth: string; toMonth: string; groupBy: GroupBy; test?: boolean },
): Promise<ReportRow[]> {
  const from = `${opts.fromMonth}-01`;
  const test = opts.test ?? false;
  // Ende exklusiv: erster Tag nach dem Bis-Monat
  const toExclusive = sql`(${`${opts.toMonth}-01`}::date + interval '1 month')::date`;
  const g = opts.groupBy;

  const views = await db.execute<{ source: string; medium: string; campaign: string; landing: string; visits: string; starts: string }>(sql`
    select source, medium,
      ${g === "campaign" ? sql`campaign` : sql`''`} as campaign,
      ${g === "landing" ? sql`case when path like '/song/%' then '(fragebogen)' else path end` : sql`''`} as landing,
      sum(views) filter (where path not like '/song/%') as visits,
      sum(views) filter (where path like '/song/%') as starts
    from page_view_stats
    where day >= ${from}::date and day < ${toExclusive}
    group by 1, 2, 3, 4
  `);

  const orderRows = await db.execute<{
    source: string;
    medium: string;
    campaign: string;
    landing: string;
    orders: string;
    previews: string;
    paid: string;
    refunded: string;
    revenue: string | null;
  }>(sql`
    with o as (
      select o.id, o.status, o.paid_at,
        coalesce('partner-' || lower(c.code), o.attribution->>'source', 'direkt') as source,
        case when c.code is not null then 'affiliate' else coalesce(o.attribution->>'medium', 'none') end as medium,
        coalesce(o.attribution->>'campaign', '') as campaign,
        coalesce('/lieder/' || (o.attribution->>'landing'), '') as landing
      from orders o
      left join affiliate_attributions aa on aa.order_id = o.id
      left join affiliate_codes c on c.id = aa.code_id
      where o.is_test = ${test}
        and o.created_at >= (${from}::date at time zone 'Europe/Berlin')
        and o.created_at < (${toExclusive} at time zone 'Europe/Berlin')
    )
    select source, medium,
      ${g === "campaign" ? sql`campaign` : sql`''`} as campaign,
      ${g === "landing" ? sql`landing` : sql`''`} as landing,
      count(*) as orders,
      count(*) filter (where exists (select 1 from preview_usage p where p.order_id = o.id)) as previews,
      count(*) filter (where o.paid_at is not null) as paid,
      count(*) filter (where o.status = 'refunded') as refunded,
      sum(ps.net_cents) filter (where o.paid_at is not null and o.status <> 'refunded') as revenue
    from o
    left join price_snapshots ps on ps.order_id = o.id
    group by 1, 2, 3, 4
  `);

  const costs =
    g === "landing"
      ? []
      : await db
          .select({
            source: adCosts.source,
            campaign: g === "campaign" ? adCosts.campaign : sql<string>`''`,
            cost: sql<string>`sum(${adCosts.costCents})`,
          })
          .from(adCosts)
          .where(and(sql`${adCosts.month} >= ${opts.fromMonth}`, sql`${adCosts.month} <= ${opts.toMonth}`))
          .groupBy(...(g === "campaign" ? [adCosts.source, adCosts.campaign] : [adCosts.source]));

  const map = new Map<string, ReportRow>();
  const row = (source: string, medium: string, campaign: string, landing: string) => {
    const key = [source, medium, campaign, landing].join("\u0000");
    let r = map.get(key);
    if (!r) {
      r = { source, medium, campaign, landing, visits: 0, starts: 0, orders: 0, previews: 0, paid: 0, refunded: 0, revenueNetCents: 0, costCents: 0 };
      map.set(key, r);
    }
    return r;
  };
  for (const v of views.rows) {
    const r = row(v.source, v.medium, v.campaign, v.landing);
    r.visits += num(v.visits);
    r.starts += num(v.starts);
  }
  for (const o of orderRows.rows) {
    const r = row(o.source, o.medium, o.campaign, o.landing);
    r.orders += num(o.orders);
    r.previews += num(o.previews);
    r.paid += num(o.paid);
    r.refunded += num(o.refunded);
    r.revenueNetCents += num(o.revenue);
  }
  for (const c of costs) row(c.source, "cpc", c.campaign, "").costCents += num(c.cost);

  return [...map.values()].sort((a, b) => b.revenueNetCents - a.revenueNetCents || b.visits - a.visits);
}

/** Besuche je Tag (für das Diagramm). */
export async function getDailyVisits(db: Database, fromMonth: string, toMonth: string) {
  const rows = await db.execute<{ day: string; visits: string; starts: string }>(sql`
    select to_char(day, 'YYYY-MM-DD') as day,
      coalesce(sum(views) filter (where path not like '/song/%'), 0) as visits,
      coalesce(sum(views) filter (where path like '/song/%'), 0) as starts
    from page_view_stats
    where day >= ${`${fromMonth}-01`}::date and day < (${`${toMonth}-01`}::date + interval '1 month')::date
    group by day order by day
  `);
  return rows.rows.map((r) => ({ day: r.day, visits: num(r.visits), starts: num(r.starts) }));
}
