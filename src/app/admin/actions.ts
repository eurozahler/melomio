"use server";

import { refresh } from "next/cache";
import {
  AdminActionError,
  approveCandidate,
  retryFailedOrder,
  updateSetting,
  updateSongPrice,
} from "@/admin/service";
import { getDb } from "@/db/client";
import { SETTING_KEYS, type SettingKey } from "@/db/settings";
import { getAdminUser } from "@/server/admin";
import { getSenderBoss } from "@/server/jobs";

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
