import { Suspense } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getChoiceLists, getQuestionnaire } from "@/server/catalog";
import { DRAFT_COOKIE, loadDraft } from "@/server/drafts";
import { QuestionnaireWizard } from "./questionnaire-wizard";

export default function QuestionnairePage({ params }: PageProps<"/song/[occasion]">) {
  return (
    <Suspense fallback={<WizardSkeleton />}>
      <QuestionnaireLoader params={params} />
    </Suspense>
  );
}

/** Lädt Fragebogen, Auswahllisten und den gespeicherten Entwurf – erst beim Aufruf, nie beim Bauen. */
async function QuestionnaireLoader({ params }: Pick<PageProps<"/song/[occasion]">, "params">) {
  const { occasion: slug } = await params;
  const questionnaire = await getQuestionnaire(slug);
  if (!questionnaire) notFound();

  const cookieId = (await cookies()).get(DRAFT_COOKIE)?.value;
  const [choiceLists, draft] = await Promise.all([
    getChoiceLists(),
    loadDraft(cookieId, questionnaire.occasion.id),
  ]);

  return (
    <QuestionnaireWizard
      occasionSlug={questionnaire.occasion.slug}
      occasionName={questionnaire.occasion.name}
      questions={questionnaire.questions}
      choiceLists={choiceLists}
      initialDraft={draft}
    />
  );
}

function WizardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-xl animate-pulse px-4 pt-6" aria-hidden>
      <div className="h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-3 h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-8 h-8 w-3/4 rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-6 h-12 w-full rounded-xl bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}
