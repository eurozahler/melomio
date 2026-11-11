import { and, asc, count, desc, eq, isNotNull, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { normalizeFolder } from "@/publishing/dropbox";
import type { Database } from "@/db/client";
import { auditLogs, occasions, orders, questionOptions, questionnaireVersions, questions } from "@/db/schema";
import type { QuestionDef, QuestionType } from "@/domain/questionnaire";

/**
 * Fragebogen-Builder (C6). Veröffentlichte Versionen sind unveränderlich (Bestellungen verweisen
 * darauf). Bearbeitet wird immer ein Entwurf (Version ohne publishedAt); „Veröffentlichen“ macht ihn
 * zur aktuellen Fassung für neue Bestellungen.
 */

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: "text", label: "Kurzer Text (eine Zeile)" },
  { value: "textarea", label: "Langer Text (mehrere Zeilen, Diktat möglich)" },
  { value: "single_choice", label: "Auswahl (eine Antwort)" },
  { value: "multi_choice", label: "Auswahl (mehrere Antworten)" },
  { value: "date", label: "Datum" },
];

const isChoice = (t: QuestionType) => t === "single_choice" || t === "multi_choice";
const keySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,39}$/, { error: "Kennung: nur Kleinbuchstaben, Ziffern und _ (2–40 Zeichen)" });

const questionSchema = z.object({
  key: keySchema,
  type: z.enum(["text", "textarea", "single_choice", "multi_choice", "date"]),
  label: z.string().trim().min(2, { error: "Frage fehlt" }).max(200),
  help: z.string().trim().max(300).nullable(),
  placeholder: z.string().trim().max(200).nullable(),
  required: z.boolean(),
  maxLength: z.number().int().min(1).max(2000).nullable(),
  condition: z.object({ questionKey: z.string(), anyOf: z.array(z.string()).min(1) }).nullable(),
  options: z.array(
    z.object({
      value: z
        .string()
        .trim()
        .regex(/^[a-z0-9_]{1,40}$/, { error: "Antwort-Kennung: nur Kleinbuchstaben, Ziffern und _" }),
      label: z.string().trim().min(1, { error: "Antworttext fehlt" }).max(120),
    }),
  ),
});

export type DraftQuestion = z.infer<typeof questionSchema>;

/** Prüft einen Fragebogen vollständig. Liefert verständliche Fehlermeldungen (leer = in Ordnung). */
export function validateQuestionnaire(input: unknown): {
  questions: DraftQuestion[] | null;
  problems: string[];
} {
  const parsed = z.array(questionSchema).min(1, { error: "Mindestens eine Frage" }).max(40).safeParse(input);
  if (!parsed.success) {
    return {
      questions: null,
      problems: parsed.error.issues.map((i) => {
        const [index, field] = i.path;
        return typeof index === "number"
          ? `Frage ${index + 1}${field ? ` (${String(field)})` : ""}: ${i.message}`
          : i.message;
      }),
    };
  }
  const qs = parsed.data;
  const problems: string[] = [];
  const seen = new Set<string>();
  qs.forEach((q, i) => {
    const n = `Frage ${i + 1}`;
    if (seen.has(q.key)) problems.push(`${n}: Kennung „${q.key}“ kommt doppelt vor`);
    seen.add(q.key);
    if (isChoice(q.type)) {
      if (q.options.length < 2) problems.push(`${n}: Auswahlfragen brauchen mindestens zwei Antworten`);
      const values = new Set(q.options.map((o) => o.value));
      if (values.size !== q.options.length) problems.push(`${n}: Antwort-Kennungen müssen eindeutig sein`);
    } else if (q.options.length > 0) {
      problems.push(`${n}: Nur Auswahlfragen haben Antworten`);
    }
    if (q.condition) {
      const ref = qs.slice(0, i).find((p) => p.key === q.condition!.questionKey);
      if (!ref) problems.push(`${n}: Die Bedingung muss sich auf eine frühere Frage beziehen`);
      else if (!isChoice(ref.type)) problems.push(`${n}: Bedingungen gehen nur auf Auswahlfragen`);
      else if (!q.condition.anyOf.every((v) => ref.options.some((o) => o.value === v)))
        problems.push(`${n}: Die Bedingung nennt eine Antwort, die es nicht gibt`);
    }
  });
  return { questions: problems.length ? null : qs, problems };
}

export class QuestionnaireError extends Error {
  constructor(
    public readonly code: "not_found" | "invalid" | "exists" | "no_draft",
    public readonly problems: string[] = [],
  ) {
    super(problems.join("; ") || code);
    this.name = "QuestionnaireError";
  }
}

async function audit(db: Database, actorUserId: string, action: string, entityId: string, newValue: unknown) {
  await db.insert(auditLogs).values({ actorUserId, action, entity: "occasion", entityId, newValue });
}

export async function listOccasionsAdmin(db: Database) {
  const occ = await db.select().from(occasions).orderBy(asc(occasions.sort), asc(occasions.slug));
  const versions = await db.select().from(questionnaireVersions);
  const orderCounts = await db
    .select({ occasionId: orders.occasionId, n: count() })
    .from(orders)
    .groupBy(orders.occasionId);
  return occ.map((o) => {
    const own = versions.filter((v) => v.occasionId === o.id);
    const published = own.filter((v) => v.publishedAt).sort((a, b) => b.version - a.version)[0];
    return {
      ...o,
      publishedVersion: published?.version ?? null,
      hasDraft: own.some((v) => !v.publishedAt),
      orders: orderCounts.find((c) => c.occasionId === o.id)?.n ?? 0,
    };
  });
}

const occasionSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{1,39}$/, {
      error: "Adresse: nur Kleinbuchstaben, Ziffern und - (z. B. muttertag)",
    }),
  name: z.string().trim().min(2, { error: "Name fehlt" }).max(60),
  description: z.string().trim().max(200),
});

/** Neuer Anlass – zunächst ausgeblendet, mit einem Entwurf und einer Startfrage. */
export async function createOccasion(db: Database, input: unknown, actorUserId: string) {
  const parsed = occasionSchema.safeParse(input);
  if (!parsed.success)
    throw new QuestionnaireError(
      "invalid",
      parsed.error.issues.map((i) => i.message),
    );
  const { slug, name, description } = parsed.data;
  const [exists] = await db.select({ id: occasions.id }).from(occasions).where(eq(occasions.slug, slug));
  if (exists) throw new QuestionnaireError("exists", [`Die Adresse „${slug}“ gibt es schon`]);
  const [{ sort } = { sort: 0 }] = await db.select({ sort: max(occasions.sort) }).from(occasions);
  return db.transaction(async (tx) => {
    const [occasion] = await tx
      .insert(occasions)
      .values({
        slug,
        name: { de: name },
        description: description ? { de: description } : null,
        active: false,
        sort: (sort ?? 0) + 1,
      })
      .returning();
    const [version] = await tx
      .insert(questionnaireVersions)
      .values({ occasionId: occasion!.id, version: 1 })
      .returning();
    await tx.insert(questions).values({
      versionId: version!.id,
      key: "recipient_name",
      type: "text",
      label: { de: "Wie heißt die Person, für die der Song ist?" },
      required: true,
      maxLength: 80,
      sort: 0,
    });
    await tx.insert(auditLogs).values({
      actorUserId,
      action: "occasion.create",
      entity: "occasion",
      entityId: occasion!.id,
      newValue: { slug, name },
    });
    return occasion!;
  });
}

export async function updateOccasion(db: Database, slug: string, input: unknown, actorUserId: string) {
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(60),
      description: z.string().trim().max(200),
      active: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success)
    throw new QuestionnaireError(
      "invalid",
      parsed.error.issues.map((i) => i.message),
    );
  const [occasion] = await db.select().from(occasions).where(eq(occasions.slug, slug));
  if (!occasion) throw new QuestionnaireError("not_found");
  if (parsed.data.active) {
    const [published] = await db
      .select({ id: questionnaireVersions.id })
      .from(questionnaireVersions)
      .where(
        and(eq(questionnaireVersions.occasionId, occasion.id), isNotNull(questionnaireVersions.publishedAt)),
      );
    if (!published) throw new QuestionnaireError("invalid", ["Erst veröffentlichen, dann einblenden"]);
  }
  await db
    .update(occasions)
    .set({
      name: { ...occasion.name, de: parsed.data.name },
      description: parsed.data.description
        ? { ...(occasion.description ?? {}), de: parsed.data.description }
        : null,
      active: parsed.data.active,
    })
    .where(eq(occasions.id, occasion.id));
  await audit(db, actorUserId, "occasion.update", occasion.id, parsed.data);
}

async function loadVersionQuestions(db: Database, versionId: string): Promise<DraftQuestion[]> {
  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.versionId, versionId))
    .orderBy(asc(questions.sort));
  const opts = qs.length
    ? await db
        .select()
        .from(questionOptions)
        .innerJoin(questions, eq(questionOptions.questionId, questions.id))
        .where(eq(questions.versionId, versionId))
        .orderBy(asc(questionOptions.sort))
    : [];
  return qs.map((q) => ({
    key: q.key,
    type: q.type,
    label: q.label.de,
    help: q.help?.de ?? null,
    placeholder: q.placeholder?.de ?? null,
    required: q.required,
    maxLength: q.maxLength,
    condition: q.condition ?? null,
    options: opts
      .filter((o) => o.question_options.questionId === q.id)
      .map((o) => ({ value: o.question_options.value, label: o.question_options.label.de })),
  }));
}

/** Daten für den Editor: Anlass, Entwurf (falls vorhanden) und aktuelle veröffentlichte Fassung. */
export async function getQuestionnaireEditor(db: Database, slug: string) {
  const [occasion] = await db.select().from(occasions).where(eq(occasions.slug, slug));
  if (!occasion) return null;
  const versions = await db
    .select()
    .from(questionnaireVersions)
    .where(eq(questionnaireVersions.occasionId, occasion.id))
    .orderBy(desc(questionnaireVersions.version));
  const draft = versions.find((v) => !v.publishedAt) ?? null;
  const published = versions.find((v) => v.publishedAt) ?? null;
  return {
    occasion,
    draft: draft ? { version: draft.version, questions: await loadVersionQuestions(db, draft.id) } : null,
    published: published
      ? {
          version: published.version,
          publishedAt: published.publishedAt!,
          questions: await loadVersionQuestions(db, published.id),
        }
      : null,
  };
}

async function findDraft(db: Database, occasionId: string) {
  const [draft] = await db
    .select()
    .from(questionnaireVersions)
    .where(and(eq(questionnaireVersions.occasionId, occasionId), isNull(questionnaireVersions.publishedAt)));
  return draft ?? null;
}

/** Entwurf anlegen: Kopie der aktuellen veröffentlichten Fassung (oder leer mit Startfrage). */
export async function startDraft(db: Database, slug: string, actorUserId: string) {
  const editor = await getQuestionnaireEditor(db, slug);
  if (!editor) throw new QuestionnaireError("not_found");
  if (editor.draft) return;
  const [{ v } = { v: 0 }] = await db
    .select({ v: max(questionnaireVersions.version) })
    .from(questionnaireVersions)
    .where(eq(questionnaireVersions.occasionId, editor.occasion.id));
  await db.transaction(async (tx) => {
    const [version] = await tx
      .insert(questionnaireVersions)
      .values({ occasionId: editor.occasion.id, version: (v ?? 0) + 1 })
      .returning();
    await writeQuestions(tx, version!.id, editor.published?.questions ?? []);
  });
  await audit(db, actorUserId, "questionnaire.draft", editor.occasion.id, { version: (v ?? 0) + 1 });
}

async function writeQuestions(db: Executor, versionId: string, qs: DraftQuestion[]) {
  await db.delete(questions).where(eq(questions.versionId, versionId));
  for (const [i, q] of qs.entries()) {
    const [row] = await db
      .insert(questions)
      .values({
        versionId,
        key: q.key,
        type: q.type,
        label: { de: q.label },
        help: q.help ? { de: q.help } : null,
        placeholder: q.placeholder ? { de: q.placeholder } : null,
        required: q.required,
        maxLength: q.type === "text" || q.type === "textarea" ? q.maxLength : null,
        sort: i,
        condition: q.condition,
      })
      .returning({ id: questions.id });
    if (q.options.length) {
      await db
        .insert(questionOptions)
        .values(
          q.options.map((o, j) => ({ questionId: row!.id, value: o.value, label: { de: o.label }, sort: j })),
        );
    }
  }
}

/** Entwurf speichern (ersetzt alle Fragen des Entwurfs). */
export async function saveDraft(db: Database, slug: string, input: unknown, actorUserId: string) {
  const { questions: qs, problems } = validateQuestionnaire(input);
  if (!qs) throw new QuestionnaireError("invalid", problems);
  const [occasion] = await db.select().from(occasions).where(eq(occasions.slug, slug));
  if (!occasion) throw new QuestionnaireError("not_found");
  const draft = await findDraft(db, occasion.id);
  if (!draft) throw new QuestionnaireError("no_draft");
  await db.transaction(async (tx) => writeQuestions(tx, draft.id, qs));
  await audit(db, actorUserId, "questionnaire.save", occasion.id, {
    version: draft.version,
    questions: qs.length,
  });
}

/** Entwurf veröffentlichen: gilt ab sofort für neue Bestellungen. */
export async function publishDraft(db: Database, slug: string, actorUserId: string) {
  const [occasion] = await db.select().from(occasions).where(eq(occasions.slug, slug));
  if (!occasion) throw new QuestionnaireError("not_found");
  const draft = await findDraft(db, occasion.id);
  if (!draft) throw new QuestionnaireError("no_draft");
  const { problems } = validateQuestionnaire(await loadVersionQuestions(db, draft.id));
  if (problems.length) throw new QuestionnaireError("invalid", problems);
  await db
    .update(questionnaireVersions)
    .set({ publishedAt: new Date() })
    .where(eq(questionnaireVersions.id, draft.id));
  await audit(db, actorUserId, "questionnaire.publish", occasion.id, { version: draft.version });
  return draft.version;
}

export async function discardDraft(db: Database, slug: string, actorUserId: string) {
  const [occasion] = await db.select().from(occasions).where(eq(occasions.slug, slug));
  if (!occasion) throw new QuestionnaireError("not_found");
  const draft = await findDraft(db, occasion.id);
  if (!draft) return;
  const [used] = await db
    .select({ n: count() })
    .from(orders)
    .where(eq(orders.questionnaireVersionId, draft.id));
  if ((used?.n ?? 0) > 0) throw new QuestionnaireError("invalid", ["Dieser Entwurf wird schon verwendet"]);
  await db.delete(questionnaireVersions).where(eq(questionnaireVersions.id, draft.id));
  await audit(db, actorUserId, "questionnaire.discard", occasion.id, { version: draft.version });
}

/** Für die Vorschau im Admin: Entwurf im Format des Kunden-Fragebogens. */
export function toQuestionDefs(qs: DraftQuestion[]): QuestionDef[] {
  return qs.map((q) => ({ ...q, help: q.help || null, placeholder: q.placeholder || null }));
}

/**
 * Veröffentlichung und Video je Anlass: Dropbox-Ordner (leer = Standardordner), Rabatt für die
 * Zustimmung (leer = Standard aus den Einstellungen) und Videovorlage („memorial“ = Trauer).
 */
export async function updateOccasionPublishing(
  db: Database,
  slug: string,
  input: unknown,
  actorUserId: string,
) {
  const parsed = z
    .object({
      folder: z.string().trim().max(200),
      discountPct: z
        .string()
        .trim()
        .regex(/^(\d{1,2})?$/, { error: "Rabatt: 0–50 oder leer" }),
      videoTemplate: z.enum(["standard", "memorial"]),
    })
    .safeParse(input);
  if (!parsed.success)
    throw new QuestionnaireError(
      "invalid",
      parsed.error.issues.map((i) => i.message),
    );
  const [occasion] = await db.select().from(occasions).where(eq(occasions.slug, slug));
  if (!occasion) throw new QuestionnaireError("not_found");
  let folder: string | null = null;
  if (parsed.data.folder) {
    try {
      folder = normalizeFolder(parsed.data.folder);
    } catch {
      throw new QuestionnaireError("invalid", ["Ordner ungültig (z. B. /Liebe oder /TikTok/Geburtstag)"]);
    }
  }
  const pct = parsed.data.discountPct === "" ? null : Number(parsed.data.discountPct);
  if (pct !== null && pct > 50) throw new QuestionnaireError("invalid", ["Rabatt höchstens 50 %"]);
  const value = {
    publicationFolder: folder,
    publicationDiscountPct: pct,
    videoTemplate: parsed.data.videoTemplate === "memorial" ? "memorial" : null,
  };
  await db.update(occasions).set(value).where(eq(occasions.id, occasion.id));
  await audit(db, actorUserId, "occasion.publishing", occasion.id, value);
}
