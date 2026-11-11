import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { affiliateCodes, affiliates, occasions, type PriceSnapshotItem } from "@/db/schema";
import { getSetting } from "@/db/settings-store";
import { discountFor, findValidVoucher, normalizeCode, type Voucher } from "./vouchers";

/**
 * Preisberechnung beim Kauf: Grundpreis − Rabatt für die Veröffentlichung − Code-Rabatt.
 * Pro Bestellung gilt höchstens EIN Code: Gutschein ODER Affiliate-Code (beide teilen sich die Codes).
 * Rabatte werden nacheinander abgezogen (Code-Prozent vom Rest) und nie unter 0 €.
 */

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type AppliedCode =
  | { type: "voucher"; code: string; voucher: Voucher }
  | { type: "affiliate"; code: string; codeId: string; affiliateId: string; discountPct: number };

/** Code auflösen: zuerst Gutschein, dann Affiliate-Code (Partner muss freigeschaltet sein). */
export async function resolveCode(
  db: Executor,
  rawCode: string,
  ctx: { userId: string },
): Promise<AppliedCode | null> {
  const code = normalizeCode(rawCode);
  if (!/^[A-Z0-9-]{3,30}$/.test(code)) return null;
  const voucher = await findValidVoucher(db, code);
  if (voucher) return { type: "voucher", code, voucher };
  const [row] = await db
    .select({ code: affiliateCodes, affiliate: affiliates })
    .from(affiliateCodes)
    .innerJoin(affiliates, eq(affiliateCodes.affiliateId, affiliates.id))
    .where(and(eq(affiliateCodes.code, code), eq(affiliateCodes.active, true)));
  if (!row || row.affiliate.status !== "active") return null;
  // Kein Rabatt und keine Provision für Käufe mit dem eigenen Code
  if (row.affiliate.userId === ctx.userId) return null;
  const discountPct =
    row.affiliate.discountPct ?? (await getSetting(db as Database, "affiliate_discount_pct"));
  return { type: "affiliate", code, codeId: row.code.id, affiliateId: row.affiliate.id, discountPct };
}

/** Wird die Veröffentlichung angeboten, und mit welchem Rabatt (je Anlass überschreibbar)? */
export async function publicationOffer(
  db: Executor,
  occasionId: string,
): Promise<{ enabled: boolean; discountPct: number }> {
  const enabled = (await getSetting(db as Database, "publication_enabled")) === 1;
  const [occasion] = await db
    .select({ pct: occasions.publicationDiscountPct })
    .from(occasions)
    .where(eq(occasions.id, occasionId));
  const discountPct = occasion?.pct ?? (await getSetting(db as Database, "publication_discount_pct"));
  return { enabled, discountPct: enabled ? discountPct : 0 };
}

export type PriceBreakdown = {
  items: PriceSnapshotItem[];
  publicationDiscountCents: number;
  codeDiscountCents: number;
  grossCents: number;
};

export function buildPriceItems(
  base: { productSlug: string; name: string; unitGrossCents: number },
  opts: { publicationPct: number | null; code: AppliedCode | null },
): PriceBreakdown {
  const items: PriceSnapshotItem[] = [{ ...base, quantity: 1 }];
  let remaining = base.unitGrossCents;

  const publicationDiscountCents =
    opts.publicationPct && opts.publicationPct > 0
      ? Math.min(remaining, Math.round((base.unitGrossCents * Math.min(100, opts.publicationPct)) / 100))
      : 0;
  if (publicationDiscountCents > 0) {
    items.push({
      productSlug: "publication",
      name: `Rabatt für Veröffentlichung (${opts.publicationPct} %)`,
      quantity: 1,
      unitGrossCents: -publicationDiscountCents,
    });
    remaining -= publicationDiscountCents;
  }

  let codeDiscountCents = 0;
  if (opts.code?.type === "voucher") {
    codeDiscountCents = discountFor(remaining, opts.code.voucher);
    if (codeDiscountCents > 0) {
      items.push({
        productSlug: "voucher",
        name: `Gutschein ${opts.code.code}`,
        quantity: 1,
        unitGrossCents: -codeDiscountCents,
      });
    }
  } else if (opts.code?.type === "affiliate") {
    codeDiscountCents = discountFor(remaining, { kind: "percent", value: opts.code.discountPct });
    if (codeDiscountCents > 0) {
      items.push({
        productSlug: "affiliate",
        name: `Rabattcode ${opts.code.code} (${opts.code.discountPct} %)`,
        quantity: 1,
        unitGrossCents: -codeDiscountCents,
      });
    }
  }
  remaining -= codeDiscountCents;
  return { items, publicationDiscountCents, codeDiscountCents, grossCents: remaining };
}

/** Trauer-Anlass (Vorlage „Abschiedsvideo“)? */
export async function isMemorialOrder(db: Executor, occasionId: string): Promise<boolean> {
  const [o] = await db
    .select({ t: occasions.videoTemplate })
    .from(occasions)
    .where(eq(occasions.id, occasionId));
  return o?.t === "memorial";
}
