"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  createOccasion,
  discardDraft,
  publishDraft,
  QuestionnaireError,
  saveDraft,
  startDraft,
  updateOccasion,
} from "@/admin/questionnaire";
import { getDb } from "@/db/client";
import { getAdminUser } from "@/server/admin";
import type { AdminResult } from "../actions";

/** Server-Aktionen des Fragebogen-Builders. Jede prüft selbst die Admin-Rolle. */

async function run(fn: (userId: string) => Promise<string | void>): Promise<AdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  try {
    const message = await fn(admin.id);
    refresh();
    return { ok: true, message: message ?? "Gespeichert." };
  } catch (error) {
    if (error instanceof QuestionnaireError) {
      if (error.problems.length) return { ok: false, error: error.problems.join(" · ") };
      return {
        ok: false,
        error: {
          not_found: "Nicht gefunden.",
          invalid: "Ungültig.",
          exists: "Gibt es schon.",
          no_draft: "Kein Entwurf – bitte Seite neu laden.",
        }[error.code],
      };
    }
    console.error("[Admin Fragebogen]", error);
    return { ok: false, error: "Das hat nicht geklappt." };
  }
}

export async function createOccasionAction(input: unknown): Promise<AdminResult> {
  let slug: string | null = null;
  const result = await run(async (userId) => {
    slug = (await createOccasion(getDb(), input, userId)).slug;
  });
  if (result.ok && slug) redirect(`/admin/fragebogen/${slug}`);
  return result;
}

export async function updateOccasionAction(slug: unknown, input: unknown) {
  return run(async (userId) => {
    if (typeof slug !== "string") throw new QuestionnaireError("not_found");
    await updateOccasion(getDb(), slug, input, userId);
  });
}

export async function startDraftAction(slug: unknown) {
  return run(async (userId) => {
    if (typeof slug !== "string") throw new QuestionnaireError("not_found");
    await startDraft(getDb(), slug, userId);
    return "Entwurf angelegt.";
  });
}

export async function saveDraftAction(slug: unknown, questions: unknown) {
  return run(async (userId) => {
    if (typeof slug !== "string") throw new QuestionnaireError("not_found");
    await saveDraft(getDb(), slug, questions, userId);
    return "Entwurf gespeichert.";
  });
}

export async function publishDraftAction(slug: unknown) {
  return run(async (userId) => {
    if (typeof slug !== "string") throw new QuestionnaireError("not_found");
    const version = await publishDraft(getDb(), slug, userId);
    return `Fassung ${version} ist veröffentlicht und gilt ab sofort für neue Bestellungen.`;
  });
}

export async function discardDraftAction(slug: unknown) {
  return run(async (userId) => {
    if (typeof slug !== "string") throw new QuestionnaireError("not_found");
    await discardDraft(getDb(), slug, userId);
    return "Entwurf verworfen.";
  });
}
