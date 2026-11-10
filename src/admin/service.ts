import { and, count, desc, eq, gte, ilike, inArray, or, sql, sum } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Database } from "@/db/client";
import {
  appSettings,
  auditLogs,
  jobExecutions,
  musicCandidates,
  musicJobs,
  orderStatusHistory,
  orders,
  previewUsage,
  prices,
  products,
  taxRates,
  userRoles,
  users,
} from "@/db/schema";
import { SETTINGS, validateSetting, type SettingKey } from "@/db/settings";
import type { OrderStatus } from "@/domain/order-status";
import { enqueue } from "@/jobs/enqueue";
import { QUEUES } from "@/jobs/queues";
import { nextLyricsVersion } from "@/orders/lyrics";
import { transitionOrder } from "@/orders/service";

/**
 * Basis-Admin (Modul M10): Rollen, Kennzahlen, Bestellungen, Aktionen, Einstellungen.
 * Jede Änderung wird im Audit-Log festgehalten (wer, wann, alter und neuer Wert).
 */

export const ADMIN_ROLES = ["owner", "admin"] as const;

export async function isAdmin(db: Database, userId: string): Promise<boolean> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), inArray(userRoles.role, [...ADMIN_ROLES])));
  return rows.length > 0;
}

export async function audit(
  db: Database | Parameters<Parameters<Database["transaction"]>[0]>[0],
  entry: {
    actorUserId: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
  },
) {
  await db.insert(auditLogs).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    oldValue: entry.oldValue === undefined ? null : entry.oldValue,
    newValue: entry.newValue === undefined ? null : entry.newValue,
  });
}

// --- Kennzahlen -------------------------------------------------------------

export async function getKpis(db: Database) {
  const today = sql`(date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')`;
  const [previewsToday] = await db
    .select({ n: count() })
    .from(previewUsage)
    .where(gte(previewUsage.createdAt, today));
  const [previewsTotal] = await db.select({ n: count() }).from(previewUsage);
  const [paidToday] = await db.select({ n: count() }).from(orders).where(gte(orders.paidAt, today));
  const [paidTotal] = await db
    .select({ n: count() })
    .from(orders)
    .where(sql`${orders.paidAt} is not null`);
  const [costs] = await db.select({ cents: sum(previewUsage.costEstimateCents) }).from(previewUsage);
  const [attention] = await db
    .select({ n: count() })
    .from(orders)
    .where(inArray(orders.status, ["failed", "manual_review"]));
  const total = previewsTotal?.n ?? 0;
  const paid = paidTotal?.n ?? 0;
  return {
    previewsToday: previewsToday?.n ?? 0,
    previewsTotal: total,
    paidToday: paidToday?.n ?? 0,
    paidTotal: paid,
    /** Käufe ÷ Hörproben (E12, L16) */
    conversion: total > 0 ? paid / total : null,
    previewCostCents: Number(costs?.cents ?? 0),
    needsAttention: attention?.n ?? 0,
  };
}

// --- Bestellungen ----------------------------------------------------------

export type OrderFilter = {
  status?: OrderStatus | "attention" | null;
  test?: "test" | "live" | null;
  q?: string | null;
};

export async function listOrders(db: Database, filter: OrderFilter, limit = 50) {
  const where = [];
  if (filter.status === "attention") where.push(inArray(orders.status, ["failed", "manual_review"]));
  else if (filter.status) where.push(eq(orders.status, filter.status));
  if (filter.test === "test") where.push(eq(orders.isTest, true));
  if (filter.test === "live") where.push(eq(orders.isTest, false));
  if (filter.q?.trim()) {
    const q = `%${filter.q.trim()}%`;
    where.push(or(ilike(orders.publicRef, q), ilike(users.email, q)));
  }
  return db
    .select({
      id: orders.id,
      publicRef: orders.publicRef,
      status: orders.status,
      isTest: orders.isTest,
      email: users.email,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

export async function getOrderDetail(db: Database, publicRef: string) {
  const [row] = await db
    .select({ order: orders, email: users.email })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.publicRef, publicRef));
  if (!row) return null;
  const history = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, row.order.id))
    .orderBy(desc(orderStatusHistory.at));
  const candidates = await db
    .select({ candidate: musicCandidates, phase: musicJobs.phase, provider: musicJobs.provider })
    .from(musicCandidates)
    .innerJoin(musicJobs, eq(musicCandidates.jobId, musicJobs.id))
    .where(eq(musicJobs.orderId, row.order.id))
    .orderBy(desc(musicCandidates.createdAt));
  return { ...row, history, candidates };
}

// --- Aktionen ---------------------------------------------------------------

export class AdminActionError extends Error {
  constructor(public readonly code: "not_found" | "wrong_status" | "invalid") {
    super(`Admin-Aktion abgelehnt: ${code}`);
    this.name = "AdminActionError";
  }
}

/**
 * „Schritt wiederholen“ für fehlgeschlagene Bestellungen: zurück in den Schritt, in dem der
 * Fehler auftrat, und Auftrag neu anlegen. Die Statusmaschine erlaubt nur sinnvolle Ziele.
 */
export async function retryFailedOrder(db: Database, boss: PgBoss, publicRef: string, actorUserId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.publicRef, publicRef));
  if (!order) throw new AdminActionError("not_found");
  if (order.status !== "failed") throw new AdminActionError("wrong_status");
  const [last] = await db
    .select({ from: orderStatusHistory.fromStatus })
    .from(orderStatusHistory)
    .where(and(eq(orderStatusHistory.orderId, order.id), eq(orderStatusHistory.toStatus, "failed")))
    .orderBy(desc(orderStatusHistory.at))
    .limit(1);
  const step = last?.from ?? "created";

  await db.transaction(async (tx) => {
    const reason = `Admin: Schritt „${step}“ wiederholen`;
    switch (step) {
      case "created":
        await transitionOrder(tx, order.id, "created", { actor: actorUserId, reason });
        await enqueue(boss, QUEUES.orderStart, { orderId: order.id }, { tx });
        break;
      case "lyrics_generating": {
        const targetVersion = await nextLyricsVersion(tx, order.id);
        await transitionOrder(tx, order.id, "lyrics_generating", { actor: actorUserId, reason });
        await enqueue(boss, QUEUES.lyricsGenerate, { orderId: order.id, targetVersion }, { tx });
        break;
      }
      case "lyrics_approved":
      case "music_generating":
        await transitionOrder(tx, order.id, "music_generating", { actor: actorUserId, reason });
        await tx
          .delete(jobExecutions)
          .where(eq(jobExecutions.idempotencyKey, `music.generate:${order.id}:preview`));
        await enqueue(boss, QUEUES.musicGenerate, { orderId: order.id }, { tx });
        break;
      case "paid":
        await transitionOrder(tx, order.id, "paid", { actor: actorUserId, reason });
        await tx.delete(jobExecutions).where(eq(jobExecutions.idempotencyKey, `video.start:${order.id}`));
        await enqueue(boss, QUEUES.orderPaid, { orderId: order.id }, { tx });
        break;
      case "video_rendering":
        await transitionOrder(tx, order.id, "video_rendering", { actor: actorUserId, reason });
        await tx
          .delete(jobExecutions)
          .where(eq(jobExecutions.idempotencyKey, `video.render:${order.id}:customer`));
        await enqueue(boss, QUEUES.videoRender, { orderId: order.id }, { tx });
        break;
      default:
        throw new AdminActionError("wrong_status");
    }
    await audit(tx, {
      actorUserId,
      action: "order.retry",
      entity: "order",
      entityId: order.id,
      oldValue: "failed",
      newValue: step,
    });
  });
  return step;
}

/**
 * Manuelle Prüfung: Ein Mensch hört sich den unsicheren Kandidaten an und gibt ihn frei.
 * Danach entsteht die Hörprobe wie gewohnt im Worker.
 */
export async function approveCandidate(
  db: Database,
  boss: PgBoss,
  publicRef: string,
  candidateId: string,
  actorUserId: string,
) {
  const [order] = await db.select().from(orders).where(eq(orders.publicRef, publicRef));
  if (!order) throw new AdminActionError("not_found");
  if (order.status !== "manual_review") throw new AdminActionError("wrong_status");
  const [candidate] = await db
    .select({
      id: musicCandidates.id,
      qcStatus: musicCandidates.qcStatus,
      qcResult: musicCandidates.qcResult,
    })
    .from(musicCandidates)
    .innerJoin(musicJobs, eq(musicCandidates.jobId, musicJobs.id))
    .where(and(eq(musicCandidates.id, candidateId), eq(musicJobs.orderId, order.id)));
  if (!candidate) throw new AdminActionError("not_found");

  await db.transaction(async (tx) => {
    await tx
      .update(musicCandidates)
      .set({ qcStatus: "passed", qcResult: { ...(candidate.qcResult ?? {}), adminApprovedBy: actorUserId } })
      .where(eq(musicCandidates.id, candidate.id));
    await transitionOrder(tx, order.id, "music_generating", {
      actor: actorUserId,
      reason: "Admin: Kandidat freigegeben",
    });
    await tx
      .delete(jobExecutions)
      .where(eq(jobExecutions.idempotencyKey, `music.generate:${order.id}:preview`));
    await enqueue(boss, QUEUES.musicGenerate, { orderId: order.id }, { tx });
    await audit(tx, {
      actorUserId,
      action: "candidate.approve",
      entity: "music_candidate",
      entityId: candidate.id,
      oldValue: candidate.qcStatus,
      newValue: "passed",
    });
  });
}

// --- Einstellungen und Preis -------------------------------------------------

export async function listSettings(db: Database) {
  const rows = await db.select().from(appSettings);
  return (Object.keys(SETTINGS) as SettingKey[]).map((key) => {
    const row = rows.find((r) => r.key === key);
    const parsed = SETTINGS[key].schema.safeParse(row?.value);
    return {
      key,
      value: parsed.success ? (parsed.data as number) : (SETTINGS[key].default as number),
      defaultValue: SETTINGS[key].default as number,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export async function updateSetting(db: Database, key: SettingKey, rawValue: unknown, actorUserId: string) {
  let value: unknown;
  try {
    value = validateSetting(key, rawValue);
  } catch {
    throw new AdminActionError("invalid");
  }
  await db.transaction(async (tx) => {
    const [old] = await tx.select().from(appSettings).where(eq(appSettings.key, key));
    if (old && JSON.stringify(old.value) === JSON.stringify(value)) return;
    await tx
      .insert(appSettings)
      .values({ key, value, updatedBy: actorUserId })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedBy: actorUserId, updatedAt: new Date() },
      });
    await audit(tx, {
      actorUserId,
      action: "setting.update",
      entity: "app_setting",
      entityId: key,
      oldValue: old?.value ?? null,
      newValue: value,
    });
  });
}

/** Aktueller Song-Preis (brutto) für das Admin. */
export async function getCurrentSongPrice(db: Database) {
  const [row] = await db
    .select({ grossCents: prices.grossCents, currency: prices.currency, validFrom: prices.validFrom })
    .from(prices)
    .innerJoin(products, eq(prices.productId, products.id))
    .where(eq(products.slug, "song"))
    .orderBy(desc(prices.validFrom))
    .limit(1);
  return row ?? null;
}

/**
 * Preis ändern (E13): neue Preiszeile ab jetzt. Alte Zeilen bleiben erhalten; bestehende
 * Bestellungen behalten ihren eingefrorenen Preis-Snapshot.
 */
export async function updateSongPrice(db: Database, grossCents: number, actorUserId: string) {
  if (!Number.isInteger(grossCents) || grossCents < 100 || grossCents > 100_000)
    throw new AdminActionError("invalid");
  await db.transaction(async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.slug, "song"));
    const [current] = await tx
      .select()
      .from(prices)
      .where(eq(prices.productId, product!.id))
      .orderBy(desc(prices.validFrom))
      .limit(1);
    if (!product || !current) throw new AdminActionError("not_found");
    if (current.grossCents === grossCents) return;
    const [tax] = await tx.select().from(taxRates).where(eq(taxRates.id, current.taxRateId));
    await tx
      .insert(prices)
      .values({ productId: product.id, grossCents, currency: current.currency, taxRateId: tax!.id });
    await audit(tx, {
      actorUserId,
      action: "price.update",
      entity: "price",
      entityId: "song",
      oldValue: current.grossCents,
      newValue: grossCents,
    });
  });
}

export async function listAudit(db: Database, limit = 30) {
  return db
    .select({ log: auditLogs, email: users.email })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorUserId, users.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/** Rolle vergeben (Kommandozeile `npm run admin:rolle`). */
export async function grantRole(db: Database, email: string, role: "owner" | "admin") {
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!user) return null;
  await db.insert(userRoles).values({ userId: user.id, role }).onConflictDoNothing();
  await audit(db, {
    actorUserId: null,
    action: "role.grant",
    entity: "user",
    entityId: user.id,
    newValue: role,
  });
  return user;
}

// --- Dashboard: Monatsübersicht (C6) --------------------------------------

export type MonthRow = {
  month: string;
  orders: number;
  previews: number;
  paid: number;
  revenueCents: number;
  refundedCents: number;
  musicCostCents: number;
  failed: number;
};

/** Die letzten Monate: Bestellungen, Hörproben, Käufe, Umsatz (brutto, nach Rechnungen), Musikkosten, Fehler. */
export async function getMonthlyStats(
  db: Database,
  opts: { test: boolean; months?: number },
): Promise<MonthRow[]> {
  const months = opts.months ?? 6;
  const rows = await db.execute<{
    month: string;
    orders: string;
    previews: string;
    paid: string;
    revenue: string | null;
    refunded: string | null;
    music: string | null;
    failed: string;
  }>(sql`
    with m as (
      select to_char(d, 'YYYY-MM') as month
      from generate_series(
        date_trunc('month', now() at time zone 'Europe/Berlin') - ${months - 1} * interval '1 month',
        date_trunc('month', now() at time zone 'Europe/Berlin'),
        interval '1 month'
      ) d
    ),
    o as (select * from orders where is_test = ${opts.test})
    select m.month,
      (select count(*) from o where to_char(o.created_at at time zone 'Europe/Berlin', 'YYYY-MM') = m.month) as orders,
      (select count(*) from preview_usage p join o on o.id = p.order_id
        where to_char(p.created_at at time zone 'Europe/Berlin', 'YYYY-MM') = m.month) as previews,
      (select count(*) from o where to_char(o.paid_at at time zone 'Europe/Berlin', 'YYYY-MM') = m.month) as paid,
      (select sum(i.gross_cents) from invoices i where i.is_test = ${opts.test} and i.kind = 'invoice'
        and to_char(i.issued_at at time zone 'Europe/Berlin', 'YYYY-MM') = m.month) as revenue,
      (select -sum(i.gross_cents) from invoices i where i.is_test = ${opts.test} and i.kind = 'cancellation'
        and to_char(i.issued_at at time zone 'Europe/Berlin', 'YYYY-MM') = m.month) as refunded,
      (select sum(j.cost_estimate_cents) from music_jobs j join o on o.id = j.order_id
        where to_char(j.created_at at time zone 'Europe/Berlin', 'YYYY-MM') = m.month) as music,
      (select count(distinct h.order_id) from order_status_history h join o on o.id = h.order_id
        where h.to_status = 'failed' and to_char(h.at at time zone 'Europe/Berlin', 'YYYY-MM') = m.month) as failed
    from m order by m.month desc
  `);
  return rows.rows.map((r) => ({
    month: r.month,
    orders: Number(r.orders),
    previews: Number(r.previews),
    paid: Number(r.paid),
    revenueCents: Number(r.revenue ?? 0),
    refundedCents: Number(r.refunded ?? 0),
    musicCostCents: Number(r.music ?? 0),
    failed: Number(r.failed),
  }));
}
