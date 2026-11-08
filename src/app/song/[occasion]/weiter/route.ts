import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateChoices } from "@/domain/draft";
import { validateAnswers } from "@/domain/questionnaire";
import { getQuestionnaire } from "@/server/catalog";
import { attachDraftToUser, DRAFT_COOKIE, isValidDraftCookieId, loadDraft } from "@/server/drafts";
import { getSessionUser } from "@/server/session";

/**
 * Übergang vom Fragebogen ins Konto (E11):
 * - nicht angemeldet → zur Anmeldung, danach zurück hierher
 * - angemeldet mit bestätigter E-Mail → Entwurf dem Konto zuordnen und vollständig prüfen
 * Ab Modul M4/M5 entsteht hier die Bestellung und der Songtext wird erzeugt.
 */
export async function GET(_request: Request, { params }: RouteContext<"/song/[occasion]/weiter">) {
  const { occasion: slug } = await params;
  const questionnaire = await getQuestionnaire(slug);
  if (!questionnaire) redirect("/");

  const here = `/song/${questionnaire.occasion.slug}/weiter`;
  const user = await getSessionUser();
  if (!user || !user.emailVerified) redirect(`/anmelden?next=${encodeURIComponent(here)}`);

  const cookieId = (await cookies()).get(DRAFT_COOKIE)?.value;
  const attached = isValidDraftCookieId(cookieId) ? await attachDraftToUser(cookieId, user.id) : null;
  const draft = attached ?? (await loadDraft(undefined, questionnaire.occasion.id, user.id));

  const complete =
    Object.keys(validateAnswers(questionnaire.questions, draft.answers)).length === 0 &&
    validateChoices(draft.choices).length === 0;
  if (!complete) redirect(`/song/${questionnaire.occasion.slug}`);

  redirect(`/konto?entwurf=${encodeURIComponent(questionnaire.occasion.slug)}`);
}
