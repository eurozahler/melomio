import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { validateChoices } from "@/domain/draft";
import { validateAnswers } from "@/domain/questionnaire";
import { createOrderFromDraft, TooManyOpenOrdersError } from "@/orders/service";
import { getQuestionnaire } from "@/server/catalog";
import { attachDraftToUser, DRAFT_COOKIE, isValidDraftCookieId, loadDraft } from "@/server/drafts";
import { getSenderBoss } from "@/server/jobs";
import { getSessionUser } from "@/server/session";

/**
 * Übergang vom Fragebogen zur Bestellung (E11, M4):
 * - nicht angemeldet → zur Anmeldung, danach zurück hierher
 * - angemeldet mit bestätigter E-Mail → Entwurf prüfen, Bestellung anlegen, Worker startet automatisch
 * Wiederholtes Aufrufen legt keine zweite Bestellung an: Der Entwurf wird beim Anlegen verbraucht.
 */
export async function GET(_request: Request, { params }: RouteContext<"/song/[occasion]/weiter">) {
  const { occasion: slug } = await params;
  const questionnaire = await getQuestionnaire(slug);
  if (!questionnaire) redirect("/");

  const here = `/song/${questionnaire.occasion.slug}/weiter`;
  const user = await getSessionUser();
  if (!user || !user.emailVerified) redirect(`/anmelden?next=${encodeURIComponent(here)}`);

  const cookieId = (await cookies()).get(DRAFT_COOKIE)?.value;
  const validCookie = isValidDraftCookieId(cookieId) ? cookieId : null;
  const attached = validCookie ? await attachDraftToUser(validCookie, user.id) : null;
  const draft = attached ?? (await loadDraft(undefined, questionnaire.occasion.id, user.id));

  const hasAnswers = Object.keys(draft.answers).length > 0;
  if (!hasAnswers) redirect("/konto"); // Entwurf schon verbraucht (z. B. Seite neu geladen)

  const complete =
    Object.keys(validateAnswers(questionnaire.questions, draft.answers)).length === 0 &&
    validateChoices(draft.choices).length === 0;
  if (!complete) redirect(`/song/${questionnaire.occasion.slug}`);

  let publicRef: string;
  try {
    const order = await createOrderFromDraft(getDb(), await getSenderBoss(), {
      userId: user.id,
      occasionId: questionnaire.occasion.id,
      occasionName: questionnaire.occasion.name,
      questionnaireVersionId: questionnaire.versionId,
      questions: questionnaire.questions,
      draft,
      isTest: getEnv().isTestOperation,
      draftCookieId: validCookie,
    });
    publicRef = order.publicRef;
  } catch (error) {
    if (error instanceof TooManyOpenOrdersError) redirect("/konto?hinweis=zu-viele-offen");
    throw error;
  }

  redirect(`/konto?bestellung=${encodeURIComponent(publicRef)}`);
}
