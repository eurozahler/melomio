"use server";

import { cookies } from "next/headers";
import { getEnv } from "@/config/env";
import { draftDataSchema, type DraftData } from "@/domain/draft";
import { validateAnswer } from "@/domain/questionnaire";
import { getChoiceLists, getQuestionnaire } from "@/server/catalog";
import {
  DRAFT_COOKIE,
  DRAFT_TTL_DAYS,
  isValidDraftCookieId,
  newDraftCookieId,
  storeDraft,
} from "@/server/drafts";
import { getSessionUser } from "@/server/session";

export type SaveDraftResult = { ok: true } | { ok: false; error: "unknown_occasion" | "invalid" };

/**
 * Speichert den Fragebogen-Entwurf (ohne Anmeldung, über ein Cookie).
 * Achtung: Server-Aktionen sind von außen direkt aufrufbar – deshalb wird hier alles geprüft.
 */
export async function saveDraftAction(occasionSlug: unknown, input: unknown): Promise<SaveDraftResult> {
  if (typeof occasionSlug !== "string" || occasionSlug.length > 64)
    return { ok: false, error: "unknown_occasion" };
  const questionnaire = await getQuestionnaire(occasionSlug);
  if (!questionnaire) return { ok: false, error: "unknown_occasion" };

  const parsed = draftDataSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const data: DraftData = parsed.data;

  // Nur bekannte Fragen, Werte im richtigen Format (Pflichtangaben werden erst am Ende verlangt)
  for (const [key, value] of Object.entries(data.answers)) {
    const question = questionnaire.questions.find((q) => q.key === key);
    if (!question) return { ok: false, error: "invalid" };
    const error = validateAnswer({ ...question, required: false }, value);
    if (error) return { ok: false, error: "invalid" };
  }

  // Auswahl nur aus den aktiven Listen
  const lists = await getChoiceLists();
  const known = (list: { slug: string }[], slug: string | null) =>
    slug === null || list.some((i) => i.slug === slug);
  if (
    !known(lists.genres, data.choices.genre) ||
    !known(lists.moods, data.choices.mood) ||
    !known(lists.voices, data.choices.voice)
  ) {
    return { ok: false, error: "invalid" };
  }

  const user = await getSessionUser();
  const cookieStore = await cookies();
  const issueCookie = () => {
    const id = newDraftCookieId();
    cookieStore.set(DRAFT_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: getEnv().APP_BASE_URL.startsWith("https://"),
      path: "/",
      maxAge: DRAFT_TTL_DAYS * 24 * 60 * 60,
    });
    return id;
  };

  let cookieId = cookieStore.get(DRAFT_COOKIE)?.value;
  if (!isValidDraftCookieId(cookieId)) cookieId = issueCookie();

  const stored = await storeDraft(cookieId, questionnaire.occasion.id, data, user?.id ?? null);
  if (!stored) {
    // Der Entwurf zu diesem Cookie gehört einem anderen Konto (gemeinsam genutztes Gerät): neu beginnen
    await storeDraft(issueCookie(), questionnaire.occasion.id, data, user?.id ?? null);
  }
  return { ok: true };
}
