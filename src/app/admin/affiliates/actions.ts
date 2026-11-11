"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import {
  AffiliateError,
  createPayout,
  decideAffiliate,
  markPayoutPaid,
  setAffiliateRates,
} from "@/affiliates/service";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { affiliates, users } from "@/db/schema";
import { formatMoney } from "@/invoices/pdf";
import { getAdminUser } from "@/server/admin";
import { sendEmail } from "@/server/email";
import { affiliateDecisionTemplate, affiliatePayoutTemplate } from "@/server/email/templates";
import { getStorage } from "@/storage";
import type { AdminResult } from "../actions";

async function run(fn: (userId: string) => Promise<string>): Promise<AdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  try {
    const message = await fn(admin.id);
    refresh();
    return { ok: true, message };
  } catch (error) {
    if (error instanceof AffiliateError) {
      const text = error.problems.length
        ? error.problems.join(" · ")
        : {
            not_found: "Nicht gefunden.",
            invalid: "Ungültig.",
            wrong_status: "Im aktuellen Status nicht möglich.",
            code_taken: "Code vergeben.",
            too_many: "Zu viele Codes.",
            nothing_due: "Keine fälligen Provisionen.",
          }[error.code];
      return { ok: false, error: text };
    }
    console.error("[Admin Affiliates]", error);
    return { ok: false, error: "Das hat nicht geklappt." };
  }
}

async function partnerContact(id: string) {
  const [row] = await getDb()
    .select({ email: users.email, userId: users.id, name: affiliates.fullName })
    .from(affiliates)
    .innerJoin(users, eq(affiliates.userId, users.id))
    .where(eq(affiliates.id, id));
  return row ?? null;
}

export async function decideAffiliateAction(id: unknown, decision: unknown, note: string | null = null) {
  return run(async (userId) => {
    if (
      typeof id !== "string" ||
      (decision !== "active" && decision !== "rejected" && decision !== "blocked")
    ) {
      throw new AffiliateError("invalid");
    }
    const db = getDb();
    await decideAffiliate(db, id, decision, userId, note);
    const contact = await partnerContact(id);
    const env = getEnv();
    if (contact && decision !== "blocked") {
      await sendEmail(
        {
          to: contact.email,
          userId: contact.userId,
          template: `affiliate-${decision}`,
          ...affiliateDecisionTemplate({
            name: contact.name,
            approved: decision === "active",
            partnerUrl: `${env.APP_BASE_URL}/partner`,
            isTest: env.isTestOperation,
          }),
        },
        db,
      );
    }
    return {
      active: "Freigeschaltet – Partner per E-Mail informiert.",
      rejected: "Abgelehnt – Partner informiert.",
      blocked: "Gesperrt – Codes funktionieren nicht mehr.",
    }[decision];
  });
}

const pct = (v: string) => (v.trim() === "" ? null : Number(v.trim()));

export async function setRatesAction(id: unknown, discount: unknown, commission: unknown) {
  return run(async (userId) => {
    if (typeof id !== "string" || typeof discount !== "string" || typeof commission !== "string") {
      throw new AffiliateError("invalid");
    }
    await setAffiliateRates(
      getDb(),
      id,
      { discountPct: pct(discount), commissionPct: pct(commission) },
      userId,
    );
    return "Gespeichert – gilt für neue Bestellungen.";
  });
}

export async function createPayoutAction(id: unknown, isTest: unknown) {
  return run(async (userId) => {
    if (typeof id !== "string" || typeof isTest !== "boolean") throw new AffiliateError("invalid");
    const db = getDb();
    const env = getEnv();
    const storage = getStorage(env);
    const payout = await createPayout(db, storage, id, userId, { isTest });
    const contact = await partnerContact(id);
    if (contact) {
      const file = await storage.open(payout.storageKey);
      const content = file ? Buffer.from(await new Response(file.stream).arrayBuffer()) : null;
      await sendEmail(
        {
          to: contact.email,
          userId: contact.userId,
          template: "affiliate-payout",
          ...affiliatePayoutTemplate({
            name: contact.name,
            number: payout.number,
            amount: formatMoney(payout.grossCents),
            partnerUrl: `${env.APP_BASE_URL}/partner`,
            isTest,
          }),
          attachments: content
            ? [{ filename: `${payout.number}.pdf`, content, contentType: "application/pdf" }]
            : undefined,
        },
        db,
      );
    }
    return `Gutschrift ${payout.number} über ${formatMoney(payout.grossCents)} erstellt – bitte überweisen.`;
  });
}

export async function markPayoutPaidAction(id: unknown) {
  return run(async (userId) => {
    if (typeof id !== "string") throw new AffiliateError("invalid");
    await markPayoutPaid(getDb(), id, userId);
    return "Als überwiesen markiert.";
  });
}
