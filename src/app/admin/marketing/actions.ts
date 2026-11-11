"use server";

import { refresh } from "next/cache";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { generateLandingDraft } from "@/marketing/ai-draft";
import { saveMarketingConfig } from "@/marketing/config";
import { getLandingForEdit, LandingError, saveLanding, setLandingPublished, type LandingContent } from "@/marketing/landing";
import { deleteAdCost, saveAdCost } from "@/marketing/stats";
import { getAdminUser } from "@/server/admin";
import type { AdminResult } from "../actions";

/** Server-Aktionen für Marketing (Landingpages, Werbekosten, Google-Einstellungen). */

async function run(fn: (actorId: string) => Promise<string>): Promise<AdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  try {
    const message = await fn(admin.id);
    refresh();
    return { ok: true, message };
  } catch (error) {
    if (error instanceof LandingError) {
      if (error.problems.length) return { ok: false, error: error.problems.join(" · ") };
      return {
        ok: false,
        error: {
          not_found: "Bitte die Seite zuerst speichern.",
          invalid: "Ungültige Eingabe.",
          slug_taken: "Diese Adresse ist schon vergeben.",
        }[error.code],
      };
    }
    console.error("[Admin Marketing]", error);
    return { ok: false, error: "Das hat nicht geklappt." };
  }
}

export async function saveLandingAction(occasionId: unknown, input: unknown) {
  return run(async (actorId) => {
    if (typeof occasionId !== "string") throw new LandingError("not_found");
    await saveLanding(getDb(), actorId, occasionId, input);
    return "Gespeichert.";
  });
}

export async function publishLandingAction(occasionId: unknown, published: unknown) {
  return run(async (actorId) => {
    if (typeof occasionId !== "string" || typeof published !== "boolean") throw new LandingError("invalid");
    await setLandingPublished(getDb(), actorId, occasionId, published);
    return published ? "Veröffentlicht – die Seite ist jetzt online." : "Offline genommen.";
  });
}

export type DraftResult = { ok: true; content: LandingContent; usedAi: boolean } | { ok: false; error: string };

/** KI-Entwurf (kostet einen Claude-Aufruf). Wird nicht gespeichert – erst prüfen, dann speichern. */
export async function aiDraftAction(occasionId: unknown, keyword: unknown): Promise<DraftResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  if (typeof occasionId !== "string" || typeof keyword !== "string" || keyword.length > 120)
    return { ok: false, error: "Ungültige Eingabe." };
  const data = await getLandingForEdit(getDb(), occasionId);
  if (!data) return { ok: false, error: "Anlass nicht gefunden." };
  const env = getEnv();
  try {
    const { content, usedAi } = await generateLandingDraft({
      occasionName: data.occasionName,
      slug: data.content.slug,
      keyword: keyword.trim(),
      apiKey: env.LYRICS_PROVIDER === "anthropic" ? (env.ANTHROPIC_API_KEY ?? null) : null,
    });
    return { ok: true, usedAi, content: { ...content, variants: data.content.variants } };
  } catch (error) {
    console.error("[KI-Entwurf]", error);
    return { ok: false, error: "Der KI-Entwurf hat nicht geklappt. Bitte später noch einmal versuchen." };
  }
}

export async function saveAdCostAction(input: unknown) {
  return run(async (actorId) => {
    if (!(await saveAdCost(getDb(), actorId, input))) throw new LandingError("invalid");
    return "Kosten gespeichert.";
  });
}

export async function deleteAdCostAction(id: unknown) {
  return run(async (actorId) => {
    if (typeof id !== "string") throw new LandingError("invalid");
    await deleteAdCost(getDb(), actorId, id);
    return "Gelöscht.";
  });
}

export async function saveMarketingConfigAction(input: unknown) {
  return run(async (actorId) => {
    const result = await saveMarketingConfig(getDb(), actorId, input);
    if (!result.ok) throw new LandingError("invalid", result.problems);
    return "Gespeichert.";
  });
}
