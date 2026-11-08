import "server-only";
import { and, asc, desc, eq, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  genres,
  moods,
  occasions,
  prices,
  products,
  questionOptions,
  questionnaireVersions,
  questions,
  taxRates,
  voices,
} from "@/db/schema";
import type { QuestionDef } from "@/domain/questionnaire";

/**
 * Lesender Zugriff auf Katalogdaten (Anlässe, Fragebogen, Auswahllisten, Preis).
 * Texte werden in der Oberflächensprache aufgelöst (vorerst nur Deutsch).
 */

const LOCALE = "de" as const;

export type OccasionSummary = { id: string; slug: string; name: string; description: string | null };

export async function getActiveOccasions(): Promise<OccasionSummary[]> {
  const rows = await getDb()
    .select()
    .from(occasions)
    .where(eq(occasions.active, true))
    .orderBy(asc(occasions.sort));
  return rows.map((o) => ({
    id: o.id,
    slug: o.slug,
    name: o.name[LOCALE],
    description: o.description?.[LOCALE] ?? null,
  }));
}

export type Questionnaire = {
  occasion: OccasionSummary;
  versionId: string;
  questions: QuestionDef[];
};

/** Aktuell veröffentlichte Fragebogen-Version eines Anlasses, oder null, wenn es den Anlass nicht gibt. */
export async function getQuestionnaire(slug: string): Promise<Questionnaire | null> {
  const db = getDb();
  const [occasion] = await db
    .select()
    .from(occasions)
    .where(and(eq(occasions.slug, slug), eq(occasions.active, true)));
  if (!occasion) return null;

  const [version] = await db
    .select()
    .from(questionnaireVersions)
    .where(
      and(
        eq(questionnaireVersions.occasionId, occasion.id),
        isNotNull(questionnaireVersions.publishedAt),
        lte(questionnaireVersions.publishedAt, new Date()),
      ),
    )
    .orderBy(desc(questionnaireVersions.version))
    .limit(1);
  if (!version) return null;

  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.versionId, version.id))
    .orderBy(asc(questions.sort));
  const opts = await db
    .select({
      questionId: questionOptions.questionId,
      value: questionOptions.value,
      label: questionOptions.label,
    })
    .from(questionOptions)
    .innerJoin(questions, eq(questionOptions.questionId, questions.id))
    .where(eq(questions.versionId, version.id))
    .orderBy(asc(questionOptions.sort));

  return {
    occasion: {
      id: occasion.id,
      slug: occasion.slug,
      name: occasion.name[LOCALE],
      description: occasion.description?.[LOCALE] ?? null,
    },
    versionId: version.id,
    questions: qs.map((q) => ({
      key: q.key,
      type: q.type,
      label: q.label[LOCALE],
      help: q.help?.[LOCALE] ?? null,
      placeholder: q.placeholder?.[LOCALE] ?? null,
      required: q.required,
      maxLength: q.maxLength,
      condition: q.condition,
      options: opts
        .filter((o) => o.questionId === q.id)
        .map((o) => ({ value: o.value, label: o.label[LOCALE] })),
    })),
  };
}

export type ChoiceItem = { slug: string; name: string };
export type ChoiceLists = { genres: ChoiceItem[]; moods: ChoiceItem[]; voices: ChoiceItem[] };

export async function getChoiceLists(): Promise<ChoiceLists> {
  const db = getDb();
  const load = async (table: typeof genres | typeof moods | typeof voices) =>
    (await db.select().from(table).where(eq(table.active, true)).orderBy(asc(table.sort))).map((r) => ({
      slug: r.slug,
      name: r.name[LOCALE],
    }));
  const [g, m, v] = await Promise.all([load(genres), load(moods), load(voices)]);
  return { genres: g, moods: m, voices: v };
}

export type SongPrice = { grossCents: number; currency: string; taxRateBp: number };

/** Aktuell gültiger Preis des Songs (neuester Preis mit validFrom ≤ jetzt). */
export async function getSongPrice(): Promise<SongPrice | null> {
  const [row] = await getDb()
    .select({ grossCents: prices.grossCents, currency: prices.currency, taxRateBp: taxRates.rateBp })
    .from(prices)
    .innerJoin(products, eq(prices.productId, products.id))
    .innerJoin(taxRates, eq(prices.taxRateId, taxRates.id))
    .where(and(eq(products.slug, "song"), eq(products.active, true), lte(prices.validFrom, new Date())))
    .orderBy(desc(prices.validFrom))
    .limit(1);
  return row ?? null;
}
