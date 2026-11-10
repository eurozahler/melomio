import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { auditLogs, orders, voucherRedemptions, vouchers } from "@/db/schema";

/**
 * Gutscheine (C5). Geprüft wird beim Kauf: aktiv, nicht abgelaufen, Limit bezahlter Einlösungen
 * nicht erreicht. Der Rabatt wird im eingefrorenen Preis der Bestellung festgehalten.
 */

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Voucher = typeof vouchers.$inferSelect;

export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

export class VoucherError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join("; "));
    this.name = "VoucherError";
  }
}

/** Gültiger Gutschein zum Code – oder null (unbekannt, abgelaufen, ausgeschöpft, deaktiviert). */
export async function findValidVoucher(
  db: Executor,
  rawCode: string,
  now = new Date(),
): Promise<Voucher | null> {
  const code = normalizeCode(rawCode);
  if (!/^[A-Z0-9-]{3,30}$/.test(code)) return null;
  const [v] = await db.select().from(vouchers).where(eq(vouchers.code, code));
  if (!v || !v.active) return null;
  if (v.validUntil && v.validUntil < now) return null;
  if (v.maxRedemptions !== null) {
    const [used] = await db
      .select({ n: count() })
      .from(voucherRedemptions)
      .innerJoin(orders, eq(voucherRedemptions.orderId, orders.id))
      .where(and(eq(voucherRedemptions.voucherId, v.id), isNotNull(orders.paidAt)));
    if ((used?.n ?? 0) >= v.maxRedemptions) return null;
  }
  return v;
}

/** Rabatt in Cent für einen Bruttopreis (nie mehr als der Preis). */
export function discountFor(grossCents: number, v: Pick<Voucher, "kind" | "value">): number {
  const d = v.kind === "percent" ? Math.round((grossCents * Math.min(100, v.value)) / 100) : v.value;
  return Math.max(0, Math.min(grossCents, d));
}

const createSchema = z.object({
  code: z
    .string()
    .transform(normalizeCode)
    .pipe(
      z.string().regex(/^[A-Z0-9-]{3,30}$/, { error: "Code: 3–30 Zeichen, nur Buchstaben, Ziffern und -" }),
    ),
  kind: z.enum(["percent", "fixed"]),
  value: z.number().int().min(1, { error: "Wert fehlt" }),
  maxRedemptions: z.number().int().min(1).nullable(),
  validUntil: z.coerce.date().nullable(),
  note: z.string().trim().max(200).nullable(),
});

export async function createVoucher(db: Database, input: unknown, actorUserId: string) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw new VoucherError(parsed.error.issues.map((i) => i.message));
  const v = parsed.data;
  if (v.kind === "percent" && v.value > 100) throw new VoucherError(["Prozent: höchstens 100"]);
  const [exists] = await db.select({ id: vouchers.id }).from(vouchers).where(eq(vouchers.code, v.code));
  if (exists) throw new VoucherError([`Den Code ${v.code} gibt es schon`]);
  const [row] = await db
    .insert(vouchers)
    .values({ ...v, createdBy: actorUserId })
    .returning();
  await db.insert(auditLogs).values({
    actorUserId,
    action: "voucher.create",
    entity: "voucher",
    entityId: row!.id,
    newValue: { code: v.code, kind: v.kind, value: v.value },
  });
  return row!;
}

export async function setVoucherActive(db: Database, id: string, active: boolean, actorUserId: string) {
  await db.update(vouchers).set({ active }).where(eq(vouchers.id, id));
  await db.insert(auditLogs).values({
    actorUserId,
    action: active ? "voucher.activate" : "voucher.deactivate",
    entity: "voucher",
    entityId: id,
  });
}

export async function listVouchers(db: Database) {
  const rows = await db.select().from(vouchers).orderBy(desc(vouchers.createdAt));
  const used = await db
    .select({ voucherId: voucherRedemptions.voucherId, n: count() })
    .from(voucherRedemptions)
    .innerJoin(orders, eq(voucherRedemptions.orderId, orders.id))
    .where(isNotNull(orders.paidAt))
    .groupBy(voucherRedemptions.voucherId);
  return rows.map((v) => ({ ...v, redeemed: used.find((u) => u.voucherId === v.id)?.n ?? 0 }));
}
