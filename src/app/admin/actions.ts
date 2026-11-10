"use server";

import { refresh } from "next/cache";
import {
  AdminActionError,
  approveCandidate,
  retryFailedOrder,
  updateSetting,
  updateSongPrice,
} from "@/admin/service";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { SETTING_KEYS, type SettingKey } from "@/db/settings";
import { CompanyProfileError, saveCompanyProfile } from "@/invoices/company";
import { cancelInvoice, InvoiceActionError } from "@/invoices/service";
import { refundOrder, RefundError } from "@/orders/refund";
import { createVoucher, setVoucherActive, VoucherError } from "@/orders/vouchers";
import { getPaymentProvider } from "@/payments";
import { getAdminUser } from "@/server/admin";
import { getSenderBoss } from "@/server/jobs";
import { getStorage } from "@/storage";

/**
 * Server-Aktionen des Admins. Jede prüft selbst die Admin-Rolle (das Layout allein schützt nicht –
 * Server-Aktionen sind von außen direkt aufrufbar).
 */

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string };

async function run(fn: (userId: string) => Promise<string | void>): Promise<AdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  try {
    const message = await fn(admin.id);
    refresh();
    return { ok: true, message: message ?? undefined };
  } catch (error) {
    if (error instanceof AdminActionError) {
      const text = {
        not_found: "Nicht gefunden.",
        wrong_status: "Im aktuellen Status nicht möglich – bitte Seite neu laden.",
        invalid: "Ungültiger Wert.",
      }[error.code];
      return { ok: false, error: text };
    }
    console.error("[Admin]", error);
    return { ok: false, error: "Das hat nicht geklappt." };
  }
}

export async function retryOrderAction(ref: unknown) {
  return run(async (userId) => {
    if (typeof ref !== "string") throw new AdminActionError("not_found");
    const step = await retryFailedOrder(getDb(), await getSenderBoss(), ref, userId);
    return `Schritt „${step}“ wird wiederholt.`;
  });
}

export async function approveCandidateAction(ref: unknown, candidateId: unknown) {
  return run(async (userId) => {
    if (typeof ref !== "string" || typeof candidateId !== "string") throw new AdminActionError("not_found");
    await approveCandidate(getDb(), await getSenderBoss(), ref, candidateId, userId);
    return "Kandidat freigegeben – die Hörprobe wird erstellt.";
  });
}

export async function updateSettingAction(key: unknown, value: unknown) {
  return run(async (userId) => {
    if (typeof key !== "string" || !(SETTING_KEYS as string[]).includes(key))
      throw new AdminActionError("invalid");
    const num = typeof value === "string" ? Number(value) : value;
    await updateSetting(getDb(), key as SettingKey, num, userId);
    return "Gespeichert.";
  });
}

export async function updatePriceAction(euroText: unknown) {
  return run(async (userId) => {
    if (typeof euroText !== "string") throw new AdminActionError("invalid");
    const cents = Math.round(Number(euroText.replace(",", ".")) * 100);
    await updateSongPrice(getDb(), cents, userId);
    return "Preis gespeichert – gilt ab sofort für neue Käufe.";
  });
}

export async function saveCompanyAction(values: unknown): Promise<AdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  try {
    await saveCompanyProfile(getDb(), values, admin.id);
    refresh();
    return { ok: true, message: "Firmendaten gespeichert. Sie gelten für alle neuen Rechnungen." };
  } catch (error) {
    if (error instanceof CompanyProfileError) return { ok: false, error: error.problems.join(" · ") };
    console.error("[Admin]", error);
    return { ok: false, error: "Das hat nicht geklappt." };
  }
}

export async function cancelInvoiceAction(invoiceId: unknown, reason: unknown): Promise<AdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  if (typeof invoiceId !== "string") return { ok: false, error: "Nicht gefunden." };
  try {
    const storno = await cancelInvoice(
      getDb(),
      getStorage(getEnv()),
      invoiceId,
      admin.id,
      typeof reason === "string" ? reason : null,
    );
    refresh();
    return {
      ok: true,
      message: `Stornorechnung ${storno.number} erstellt. Die Rückzahlung bitte in Mollie auslösen.`,
    };
  } catch (error) {
    if (error instanceof InvoiceActionError) {
      const text = {
        not_found: "Nicht gefunden.",
        already_cancelled: "Diese Rechnung ist bereits storniert.",
        not_cancellable: "Eine Stornorechnung kann nicht storniert werden.",
      }[error.code];
      return { ok: false, error: text };
    }
    console.error("[Admin]", error);
    return { ok: false, error: "Das hat nicht geklappt." };
  }
}

export async function refundOrderAction(ref: unknown, reason: unknown): Promise<AdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  if (typeof ref !== "string") return { ok: false, error: "Nicht gefunden." };
  try {
    const db = getDb();
    const env = getEnv();
    const result = await refundOrder(
      db,
      getPaymentProvider(env, db),
      getStorage(env),
      ref,
      admin.id,
      typeof reason === "string" ? reason : null,
    );
    refresh();
    return {
      ok: true,
      message: `Erstattet${result.stornoNumber ? ` – Stornorechnung ${result.stornoNumber}` : ""}. Der Kunde erhält das Geld über das ursprüngliche Zahlungsmittel.`,
    };
  } catch (error) {
    if (error instanceof RefundError) {
      const text = {
        not_found: "Nicht gefunden.",
        not_paid: "Diese Bestellung ist nicht bezahlt.",
        wrong_status: "Gerade läuft noch ein Schritt – bitte warten oder Seite neu laden.",
        already_refunded: "Bereits erstattet.",
      }[error.code];
      return { ok: false, error: text };
    }
    console.error("[Admin] Erstattung", error);
    return { ok: false, error: error instanceof Error ? error.message : "Das hat nicht geklappt." };
  }
}

export async function createVoucherAction(input: unknown): Promise<AdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  try {
    const v = await createVoucher(getDb(), input, admin.id);
    refresh();
    return { ok: true, message: `Gutschein ${v.code} angelegt.` };
  } catch (error) {
    if (error instanceof VoucherError) return { ok: false, error: error.problems.join(" · ") };
    console.error("[Admin Gutschein]", error);
    return { ok: false, error: "Das hat nicht geklappt." };
  }
}

export async function setVoucherActiveAction(id: unknown, active: unknown): Promise<AdminResult> {
  return run(async (userId) => {
    if (typeof id !== "string" || typeof active !== "boolean") throw new AdminActionError("invalid");
    await setVoucherActive(getDb(), id, active, userId);
    return active ? "Aktiviert." : "Deaktiviert.";
  });
}
