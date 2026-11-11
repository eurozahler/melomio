import { and, count, desc, eq, inArray, isNotNull, isNull, lte, sql, sum } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  affiliateAttributions,
  affiliateCodes,
  affiliateCommissions,
  affiliatePayouts,
  affiliates,
  auditLogs,
  orders,
  priceSnapshots,
  users,
  vouchers,
  type AffiliateStatus,
  type AffiliateTaxStatus,
  type InvoiceLine,
} from "@/db/schema";
import { getSetting } from "@/db/settings-store";
import { getCompanyProfile, TEST_SELLER, toSeller } from "@/invoices/company";
import { renderInvoicePdf } from "@/invoices/pdf";
import { berlinYear, nextNumber, storePdf } from "@/invoices/service";
import { sendAlert } from "@/monitoring/alerts";
import { normalizeCode } from "@/orders/vouchers";
import type { StorageProvider } from "@/storage";

/**
 * Affiliate-Programm:
 * - Bewerbung mit Kontakt-, Auszahlungs- und Steuerdaten → Admin schaltet frei (oder lehnt ab)
 * - Freigeschaltete Partner erzeugen Codes (bis 10); Kunden bekommen damit Rabatt
 * - Provision je bezahlter Bestellung: Prozent vom Nettobetrag (nach Rabatt), auszahlbar nach der
 *   Wartezeit (Erstattungen), erstattete Bestellungen → keine Provision
 * - Monatliche Auszahlung per Überweisung mit Gutschrift (GS-JJJJ-NNNNN) als PDF
 */

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Affiliate = typeof affiliates.$inferSelect;
export const MAX_CODES = 10;

export class AffiliateError extends Error {
  constructor(
    public readonly code:
      "not_found" | "invalid" | "wrong_status" | "code_taken" | "too_many" | "nothing_due",
    public readonly problems: string[] = [],
  ) {
    super(problems.join("; ") || code);
    this.name = "AffiliateError";
  }
}

/** IBAN-Prüfung (Länge und Prüfziffer nach ISO 13616, mod 97). */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("DE") && iban.length !== 22) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

const t = (max: number) => z.string().trim().max(max);

export const applicationSchema = z
  .object({
    fullName: t(120).min(3, { error: "Name fehlt" }),
    company: t(120).default(""),
    street: t(120).min(3, { error: "Straße fehlt" }),
    postalCode: t(5).regex(/^[0-9]{5}$/, { error: "PLZ: 5 Ziffern" }),
    city: t(80).min(2, { error: "Ort fehlt" }),
    channels: t(1000).min(10, { error: "Bitte beschreibe kurz, wo du werben möchtest (mind. 10 Zeichen)" }),
    accountHolder: t(120).min(3, { error: "Kontoinhaber fehlt" }),
    iban: z
      .string()
      .transform((v) => v.replace(/\s+/g, "").toUpperCase())
      .refine(isValidIban, { error: "IBAN ungültig" }),
    taxStatus: z.enum(["private", "small_business", "vat_registered"]),
    vatId: z
      .string()
      .transform((v) => v.replace(/\s+/g, "").toUpperCase())
      .pipe(z.string().regex(/^(DE[0-9]{9})?$/, { error: "USt-IdNr. hat die Form DE123456789" }))
      .default(""),
    taxNumber: t(30).default(""),
    termsAccepted: z.literal(true, { error: "Bitte stimme den Partnerbedingungen zu" }),
  })
  .refine((d) => d.taxStatus !== "vat_registered" || d.vatId || d.taxNumber, {
    error: "Umsatzsteuerpflichtig: USt-IdNr. oder Steuernummer angeben",
    path: ["vatId"],
  })
  .refine((d) => d.taxStatus !== "small_business" || d.taxNumber || d.vatId, {
    error: "Kleinunternehmer: Steuernummer angeben",
    path: ["taxNumber"],
  });

function parseApplication(input: unknown) {
  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success)
    throw new AffiliateError(
      "invalid",
      parsed.error.issues.map((i) => i.message),
    );
  const d = parsed.data;
  return {
    fullName: d.fullName,
    company: d.company || null,
    street: d.street,
    postalCode: d.postalCode,
    city: d.city,
    channels: d.channels,
    accountHolder: d.accountHolder,
    iban: d.iban,
    taxStatus: d.taxStatus,
    vatId: d.vatId || null,
    taxNumber: d.taxNumber || null,
  };
}

export async function getAffiliateForUser(db: Executor, userId: string): Promise<Affiliate | null> {
  const [row] = await db.select().from(affiliates).where(eq(affiliates.userId, userId));
  return row ?? null;
}

/** Bewerbung (oder erneute Bewerbung nach Ablehnung). */
export async function applyAsAffiliate(db: Database, userId: string, input: unknown): Promise<Affiliate> {
  const data = parseApplication(input);
  const existing = await getAffiliateForUser(db, userId);
  if (existing && existing.status !== "rejected") throw new AffiliateError("wrong_status");
  const [row] = existing
    ? await db
        .update(affiliates)
        .set({ ...data, status: "pending", decidedAt: null, decidedBy: null, updatedAt: new Date() })
        .where(eq(affiliates.id, existing.id))
        .returning()
    : await db
        .insert(affiliates)
        .values({ ...data, userId })
        .returning();
  await sendAlert(db, `affiliate-apply:${row!.id}`, "Neue Affiliate-Bewerbung", [
    `${data.fullName}${data.company ? ` (${data.company})` : ""}`,
    `Kanäle: ${data.channels.slice(0, 300)}`,
    "Bitte im Admin unter „Affiliates“ prüfen und freischalten oder ablehnen.",
  ]);
  return row!;
}

/** Partner ändert seine Kontakt-, Bank- oder Steuerdaten (Status bleibt). */
export async function updateAffiliateData(db: Database, userId: string, input: unknown) {
  const data = parseApplication(input);
  const existing = await getAffiliateForUser(db, userId);
  if (!existing || existing.status === "blocked") throw new AffiliateError("wrong_status");
  await db
    .update(affiliates)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(affiliates.id, existing.id));
}

async function audit(
  db: Executor,
  actorUserId: string,
  action: string,
  entityId: string,
  newValue?: unknown,
) {
  await db.insert(auditLogs).values({ actorUserId, action, entity: "affiliate", entityId, newValue });
}

/** Admin: freischalten, ablehnen oder sperren. */
export async function decideAffiliate(
  db: Database,
  id: string,
  status: Extract<AffiliateStatus, "active" | "rejected" | "blocked">,
  actorUserId: string,
  note: string | null = null,
) {
  const [row] = await db
    .update(affiliates)
    .set({ status, decidedAt: new Date(), decidedBy: actorUserId, adminNote: note, updatedAt: new Date() })
    .where(eq(affiliates.id, id))
    .returning();
  if (!row) throw new AffiliateError("not_found");
  // Gesperrt: Codes funktionieren nicht mehr (resolveCode prüft den Status)
  await audit(db, actorUserId, `affiliate.${status}`, id, { note });
  return row;
}

const pctSchema = z.number().int().min(0).max(50).nullable();

/** Admin: Rabatt und Provision je Partner (null = Standard aus den Einstellungen). */
export async function setAffiliateRates(
  db: Database,
  id: string,
  rates: { discountPct: unknown; commissionPct: unknown },
  actorUserId: string,
) {
  const d = pctSchema.safeParse(rates.discountPct);
  const c = pctSchema.safeParse(rates.commissionPct);
  if (!d.success || !c.success) throw new AffiliateError("invalid", ["Prozent: 0–50 oder leer (Standard)"]);
  await db
    .update(affiliates)
    .set({ discountPct: d.data, commissionPct: c.data, updatedAt: new Date() })
    .where(eq(affiliates.id, id));
  await audit(db, actorUserId, "affiliate.rates", id, { discountPct: d.data, commissionPct: c.data });
}

function suggestCode(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
  return `${base || "MELOMIO"}${Math.floor(100 + Math.random() * 900)}`;
}

/** Partner erzeugt einen Code (Wunschcode oder automatisch). Codes teilen sich den Namensraum mit Gutscheinen. */
export async function createAffiliateCode(db: Database, userId: string, wanted: string | null) {
  const affiliate = await getAffiliateForUser(db, userId);
  if (affiliate?.status !== "active") throw new AffiliateError("wrong_status");
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(affiliateCodes)
    .where(eq(affiliateCodes.affiliateId, affiliate.id));
  if (n >= MAX_CODES) throw new AffiliateError("too_many");
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = wanted?.trim() ? normalizeCode(wanted) : suggestCode(affiliate.fullName);
    if (!/^[A-Z0-9-]{4,20}$/.test(code)) {
      throw new AffiliateError("invalid", ["Code: 4–20 Zeichen, nur Buchstaben, Ziffern und -"]);
    }
    const [voucher] = await db.select({ id: vouchers.id }).from(vouchers).where(eq(vouchers.code, code));
    const [taken] = await db
      .select({ id: affiliateCodes.id })
      .from(affiliateCodes)
      .where(eq(affiliateCodes.code, code));
    if (voucher || taken) {
      if (wanted?.trim()) throw new AffiliateError("code_taken");
      continue;
    }
    const [row] = await db.insert(affiliateCodes).values({ affiliateId: affiliate.id, code }).returning();
    return row!;
  }
  throw new AffiliateError("code_taken");
}

export async function setAffiliateCodeActive(db: Database, userId: string, codeId: string, active: boolean) {
  const affiliate = await getAffiliateForUser(db, userId);
  if (!affiliate) throw new AffiliateError("not_found");
  await db
    .update(affiliateCodes)
    .set({ active })
    .where(and(eq(affiliateCodes.id, codeId), eq(affiliateCodes.affiliateId, affiliate.id)));
}

/**
 * Nach bestätigter Zahlung: Provision festhalten (höchstens einmal je Bestellung).
 * Grundlage ist der Nettobetrag der Bestellung (nach allen Rabatten, ohne MwSt.).
 */
export async function recordCommission(db: Database, orderId: string): Promise<string> {
  const [row] = await db
    .select({
      attribution: affiliateAttributions,
      code: affiliateCodes,
      affiliate: affiliates,
      order: orders,
      snap: priceSnapshots,
    })
    .from(affiliateAttributions)
    .innerJoin(affiliateCodes, eq(affiliateAttributions.codeId, affiliateCodes.id))
    .innerJoin(affiliates, eq(affiliateCodes.affiliateId, affiliates.id))
    .innerJoin(orders, eq(affiliateAttributions.orderId, orders.id))
    .innerJoin(priceSnapshots, eq(priceSnapshots.orderId, orders.id))
    .where(eq(affiliateAttributions.orderId, orderId));
  if (!row) return "kein Affiliate-Code";
  if (!row.order.paidAt) return "übersprungen (nicht bezahlt)";
  const pct = row.affiliate.commissionPct ?? (await getSetting(db, "affiliate_commission_pct"));
  const holdDays = await getSetting(db, "affiliate_hold_days");
  const commissionCents = Math.round((row.snap.netCents * pct) / 100);
  await db
    .insert(affiliateCommissions)
    .values({
      affiliateId: row.affiliate.id,
      orderId,
      codeId: row.code.id,
      baseNetCents: row.snap.netCents,
      commissionPct: pct,
      commissionCents,
      isTest: row.order.isTest,
      payableAt: new Date(row.order.paidAt.getTime() + holdDays * 86_400_000),
    })
    .onConflictDoNothing({ target: affiliateCommissions.orderId });
  return `Provision ${commissionCents} Cent für ${row.code.code}`;
}

/** Erstattung: offene Provision verfällt; bereits ausgezahlte → Hinweis an den Admin. */
export async function cancelCommissionForOrder(db: Executor, orderId: string) {
  const [c] = await db.select().from(affiliateCommissions).where(eq(affiliateCommissions.orderId, orderId));
  if (!c || c.status === "canceled") return;
  if (c.status === "paid" || c.payoutId) {
    await sendAlert(db as Database, `commission-clawback:${c.id}`, "Erstattung nach Provisionsauszahlung", [
      `Für eine erstattete Bestellung wurde bereits Provision (${(c.commissionCents / 100).toFixed(2)} €) ausgezahlt bzw. abgerechnet.`,
      "Bitte mit dem Partner klären (Verrechnung mit der nächsten Auszahlung).",
    ]);
    return;
  }
  await db.update(affiliateCommissions).set({ status: "canceled" }).where(eq(affiliateCommissions.id, c.id));
}

const dueFilter = (now: Date) =>
  and(
    eq(affiliateCommissions.status, "pending"),
    isNull(affiliateCommissions.payoutId),
    lte(affiliateCommissions.payableAt, now),
  );

/** Übersicht für den Partner: Codes mit Nutzung, Provisionen, Summen. */
export async function getAffiliateDashboard(db: Database, affiliateId: string, now = new Date()) {
  const codes = await db
    .select({
      code: affiliateCodes,
      uses: sql<number>`(select count(*)::int from ${affiliateCommissions} c where c.code_id = ${affiliateCodes.id} and c.status <> 'canceled')`,
    })
    .from(affiliateCodes)
    .where(eq(affiliateCodes.affiliateId, affiliateId))
    .orderBy(desc(affiliateCodes.createdAt));
  const commissions = await db
    .select({ c: affiliateCommissions, ref: orders.publicRef, code: affiliateCodes.code })
    .from(affiliateCommissions)
    .innerJoin(orders, eq(affiliateCommissions.orderId, orders.id))
    .innerJoin(affiliateCodes, eq(affiliateCommissions.codeId, affiliateCodes.id))
    .where(eq(affiliateCommissions.affiliateId, affiliateId))
    .orderBy(desc(affiliateCommissions.createdAt))
    .limit(100);
  const payouts = await db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.affiliateId, affiliateId))
    .orderBy(desc(affiliatePayouts.issuedAt));
  const totals = { waiting: 0, due: 0, inPayout: 0, paid: 0 };
  for (const { c } of commissions) {
    if (c.status === "canceled") continue;
    if (c.status === "paid") totals.paid += c.commissionCents;
    else if (c.payoutId) totals.inPayout += c.commissionCents;
    else if (c.payableAt <= now) totals.due += c.commissionCents;
    else totals.waiting += c.commissionCents;
  }
  return { codes, commissions, payouts, totals };
}

/** Admin-Liste mit fälligen Beträgen. */
export async function listAffiliates(db: Database, now = new Date()) {
  const rows = await db
    .select({ a: affiliates, email: users.email })
    .from(affiliates)
    .innerJoin(users, eq(affiliates.userId, users.id))
    .orderBy(desc(affiliates.createdAt));
  const due = await db
    .select({
      affiliateId: affiliateCommissions.affiliateId,
      isTest: affiliateCommissions.isTest,
      cents: sum(affiliateCommissions.commissionCents).mapWith(Number),
      n: count(),
    })
    .from(affiliateCommissions)
    .where(dueFilter(now))
    .groupBy(affiliateCommissions.affiliateId, affiliateCommissions.isTest);
  const sales = await db
    .select({ affiliateId: affiliateCommissions.affiliateId, n: count() })
    .from(affiliateCommissions)
    .where(inArray(affiliateCommissions.status, ["pending", "payable", "paid"]))
    .groupBy(affiliateCommissions.affiliateId);
  return rows.map((r) => ({
    ...r,
    sales: sales.find((s) => s.affiliateId === r.a.id)?.n ?? 0,
    due: due.filter((d) => d.affiliateId === r.a.id),
  }));
}

const TAX_TEXT: Record<AffiliateTaxStatus, string | null> = {
  vat_registered: null,
  small_business: "Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG.",
  private: "Keine Umsatzsteuer (Privatperson, nicht unternehmerisch tätig).",
};

/**
 * Auszahlung erstellen: alle fälligen Provisionen eines Partners (getrennt nach Test/Live) in eine
 * Gutschrift. Bei umsatzsteuerpflichtigen Partnern kommt 19 % USt. hinzu (Gutschrift nach § 14 Abs. 2 UStG).
 */
export async function createPayout(
  db: Database,
  storage: StorageProvider,
  affiliateId: string,
  actorUserId: string,
  opts: { isTest: boolean; now?: Date },
) {
  const now = opts.now ?? new Date();
  const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, affiliateId));
  if (!affiliate) throw new AffiliateError("not_found");
  const company = await getCompanyProfile(db);
  if (!opts.isTest && !company.complete)
    throw new AffiliateError("invalid", ["Firmendaten fehlen (Admin → Firma)"]);
  const issuer = company.complete ? toSeller(company.profile) : TEST_SELLER;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`melomio:payout:${affiliateId}`}))`);
    const due = await tx
      .select({ c: affiliateCommissions, ref: orders.publicRef })
      .from(affiliateCommissions)
      .innerJoin(orders, eq(affiliateCommissions.orderId, orders.id))
      .where(
        and(
          eq(affiliateCommissions.affiliateId, affiliateId),
          eq(affiliateCommissions.isTest, opts.isTest),
          dueFilter(now),
          isNotNull(orders.paidAt),
        ),
      );
    if (due.length === 0) throw new AffiliateError("nothing_due");
    const netCents = due.reduce((s, d) => s + d.c.commissionCents, 0);
    const vat = affiliate.taxStatus === "vat_registered";
    const rateBp = vat ? 1900 : 0;
    const taxCents = vat ? Math.round((netCents * rateBp) / 10_000) : 0;
    const lines: InvoiceLine[] = [
      {
        description: `Provision für ${due.length} vermittelte Bestellung${due.length === 1 ? "" : "en"} (${due
          .map((d) => d.ref)
          .slice(0, 12)
          .join(", ")}${due.length > 12 ? " …" : ""})`,
        quantity: 1,
        netCents,
        taxCents,
        grossCents: netCents + taxCents,
        taxRateBp: rateBp,
      },
    ];
    const number = await nextNumber(tx, "GS", opts.isTest, berlinYear(now));
    const recipient = {
      name: affiliate.company || affiliate.fullName,
      lines: [
        ...(affiliate.company ? [affiliate.fullName] : []),
        affiliate.street,
        `${affiliate.postalCode} ${affiliate.city}`,
        ...(affiliate.vatId ? [`USt-IdNr.: ${affiliate.vatId}`] : []),
        ...(affiliate.taxNumber ? [`Steuernummer: ${affiliate.taxNumber}`] : []),
      ],
      vatId: affiliate.vatId,
      taxNumber: affiliate.taxNumber,
    };
    const statement = affiliate.taxStatus === "private";
    const pdf = await renderInvoicePdf({
      kind: "invoice",
      number,
      issuedAt: now,
      serviceDate: now,
      orderRef: `P-${affiliate.id.slice(0, 8).toUpperCase()}`,
      seller: issuer,
      buyer: recipient,
      lines,
      netCents,
      taxCents,
      grossCents: netCents + taxCents,
      currency: "EUR",
      paymentNote: `Auszahlung per Überweisung an ${affiliate.accountHolder}, IBAN ${maskIban(affiliate.iban)}.`,
      isTest: opts.isTest,
      labels: {
        title: statement ? "Provisionsabrechnung" : "Gutschrift",
        number: statement ? "Abrechnungs-Nr." : "Gutschrift-Nr.",
        ref: "Partner-Nr.",
        intro: "Für die Vermittlung folgender Bestellungen schreiben wir Ihnen gut:",
        testMark: "TEST – keine gültige Gutschrift",
        taxLine: TAX_TEXT[affiliate.taxStatus],
        footnote: statement
          ? "Bitte beachten Sie: Provisionen können einkommensteuerpflichtig sein."
          : "Gutschrift im Sinne von § 14 Abs. 2 Satz 2 UStG. Widerspruch bitte innerhalb von 14 Tagen.",
      },
    });
    const storageKey = `payouts/${berlinYear(now)}/${number}.pdf`;
    const [payout] = await tx
      .insert(affiliatePayouts)
      .values({
        number,
        affiliateId,
        isTest: opts.isTest,
        issuedAt: now,
        issuer,
        recipient,
        taxStatus: affiliate.taxStatus,
        lines,
        netCents,
        taxCents,
        grossCents: netCents + taxCents,
        iban: affiliate.iban,
        accountHolder: affiliate.accountHolder,
        storageKey,
        createdBy: actorUserId,
      })
      .returning();
    await tx
      .update(affiliateCommissions)
      .set({ payoutId: payout!.id })
      .where(
        inArray(
          affiliateCommissions.id,
          due.map((d) => d.c.id),
        ),
      );
    await storePdf(storage, storageKey, pdf);
    await audit(tx, actorUserId, "affiliate.payout", affiliateId, { number, netCents, taxCents });
    return payout!;
  });
}

/** Admin hat überwiesen → Auszahlung und zugehörige Provisionen „bezahlt“. */
export async function markPayoutPaid(db: Database, payoutId: string, actorUserId: string) {
  await db.transaction(async (tx) => {
    const [p] = await tx
      .update(affiliatePayouts)
      .set({ paidAt: new Date(), paidBy: actorUserId })
      .where(and(eq(affiliatePayouts.id, payoutId), isNull(affiliatePayouts.paidAt)))
      .returning();
    if (!p) throw new AffiliateError("wrong_status");
    await tx
      .update(affiliateCommissions)
      .set({ status: "paid" })
      .where(eq(affiliateCommissions.payoutId, payoutId));
    await audit(tx, actorUserId, "affiliate.payout.paid", p.affiliateId, { number: p.number });
  });
}

export async function listPayouts(db: Database) {
  return db
    .select({ p: affiliatePayouts, name: affiliates.fullName })
    .from(affiliatePayouts)
    .innerJoin(affiliates, eq(affiliatePayouts.affiliateId, affiliates.id))
    .orderBy(desc(affiliatePayouts.issuedAt))
    .limit(200);
}

export function maskIban(iban: string): string {
  return iban.length > 8 ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : iban;
}
