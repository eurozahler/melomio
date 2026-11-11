"use server";

import { refresh } from "next/cache";
import {
  AffiliateError,
  applyAsAffiliate,
  createAffiliateCode,
  setAffiliateCodeActive,
  updateAffiliateData,
} from "@/affiliates/service";
import { getDb } from "@/db/client";
import { getSessionUser } from "@/server/session";

export type PartnerResult = { ok: true; message?: string } | { ok: false; error: string };

const ERRORS: Record<AffiliateError["code"], string> = {
  not_found: "Nicht gefunden.",
  invalid: "Bitte prüfe deine Angaben.",
  wrong_status: "Das ist gerade nicht möglich – bitte lade die Seite neu.",
  code_taken: "Diesen Code gibt es schon. Bitte wähle einen anderen.",
  too_many: "Du hast schon die höchste Zahl an Codes.",
  nothing_due: "Nichts fällig.",
};

async function run(fn: (userId: string) => Promise<string | void>): Promise<PartnerResult> {
  const user = await getSessionUser();
  if (!user?.emailVerified) return { ok: false, error: "Bitte melde dich an." };
  try {
    const message = await fn(user.id);
    refresh();
    return { ok: true, message: message ?? undefined };
  } catch (error) {
    if (error instanceof AffiliateError) {
      return { ok: false, error: error.problems.length ? error.problems.join(" · ") : ERRORS[error.code] };
    }
    console.error("[Partner]", error);
    return { ok: false, error: "Das hat nicht geklappt." };
  }
}

export async function applyAction(input: unknown) {
  return run(async (userId) => {
    await applyAsAffiliate(getDb(), userId, input);
    return "Danke! Wir prüfen deine Bewerbung und melden uns per E-Mail.";
  });
}

export async function updateDataAction(input: unknown) {
  return run(async (userId) => {
    await updateAffiliateData(getDb(), userId, input);
    return "Gespeichert.";
  });
}

export async function createCodeAction(wanted: unknown) {
  return run(async (userId) => {
    const code = await createAffiliateCode(getDb(), userId, typeof wanted === "string" ? wanted : null);
    return `Code ${code.code} erstellt.`;
  });
}

export async function toggleCodeAction(codeId: unknown, active: unknown) {
  return run(async (userId) => {
    if (typeof codeId !== "string" || typeof active !== "boolean") throw new AffiliateError("invalid");
    await setAffiliateCodeActive(getDb(), userId, codeId, active);
  });
}
