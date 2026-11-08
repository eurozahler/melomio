import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { occasions, questionOptions, questionnaireVersions, questions } from "@/db/schema";
import type { QuestionDef } from "@/domain/questionnaire";

/** Fragebogen eines Anlasses aus der Testdatenbank (ohne die App-Verbindung zu benutzen). */
export async function getQuestionnaireForTest(db: Database, slug: string) {
  const [occasion] = await db.select().from(occasions).where(eq(occasions.slug, slug));
  if (!occasion) throw new Error(`Anlass ${slug} fehlt`);
  const [version] = await db
    .select()
    .from(questionnaireVersions)
    .where(and(eq(questionnaireVersions.occasionId, occasion.id)));
  if (!version) throw new Error("Version fehlt");
  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.versionId, version.id))
    .orderBy(asc(questions.sort));
  const opts = await db.select().from(questionOptions);
  const defs: QuestionDef[] = qs.map((q) => ({
    key: q.key,
    type: q.type,
    label: q.label.de,
    help: null,
    placeholder: null,
    required: q.required,
    maxLength: q.maxLength,
    condition: q.condition,
    options: opts.filter((o) => o.questionId === q.id).map((o) => ({ value: o.value, label: o.label.de })),
  }));
  return { occasion: { id: occasion.id, name: occasion.name.de }, versionId: version.id, questions: defs };
}
