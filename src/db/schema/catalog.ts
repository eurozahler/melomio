import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { questionTypeEnum, type LocalizedText } from "./enums";

/** Bedingung für Folgefragen: Frage nur zeigen, wenn eine andere Frage einen bestimmten Wert hat. */
export type QuestionCondition = {
  questionKey: string;
  /** Mindestens einer dieser Werte muss gewählt sein. */
  anyOf: string[];
};

export const occasions = pgTable("occasions", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: jsonb().$type<LocalizedText>().notNull(),
  description: jsonb().$type<LocalizedText>(),
  active: boolean().notNull().default(true),
  sort: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Unveränderliche Fragebogen-Versionen. Eine Bestellung verweist auf genau eine Version. */
export const questionnaireVersions = pgTable(
  "questionnaire_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    occasionId: uuid()
      .notNull()
      .references(() => occasions.id),
    version: integer().notNull(),
    publishedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.occasionId, t.version)],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid().primaryKey().defaultRandom(),
    versionId: uuid()
      .notNull()
      .references(() => questionnaireVersions.id, { onDelete: "cascade" }),
    key: text().notNull(),
    type: questionTypeEnum().notNull(),
    label: jsonb().$type<LocalizedText>().notNull(),
    help: jsonb().$type<LocalizedText>(),
    placeholder: jsonb().$type<LocalizedText>(),
    required: boolean().notNull().default(false),
    maxLength: integer(),
    sort: integer().notNull().default(0),
    condition: jsonb().$type<QuestionCondition>(),
  },
  (t) => [unique().on(t.versionId, t.key), index().on(t.versionId, t.sort)],
);

export const questionOptions = pgTable(
  "question_options",
  {
    id: uuid().primaryKey().defaultRandom(),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    value: text().notNull(),
    label: jsonb().$type<LocalizedText>().notNull(),
    sort: integer().notNull().default(0),
  },
  (t) => [unique().on(t.questionId, t.value)],
);

/** Gemeinsamer Aufbau der Auswahllisten. `promptHint` ist der Text, der an die Musik-KI geht. */
const choiceColumns = () => ({
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: jsonb().$type<LocalizedText>().notNull(),
  promptHint: text().notNull(),
  active: boolean().notNull().default(true),
  sort: integer().notNull().default(0),
});

export const genres = pgTable("genres", choiceColumns());
export const moods = pgTable("moods", choiceColumns());
/** Stimmen sind Beschreibungen („warme Männerstimme“), keine Garantie (W7). */
export const voices = pgTable("voices", choiceColumns());

export const taxRates = pgTable("tax_rates", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  country: text().notNull(),
  /** Steuersatz in Basispunkten: 1900 = 19 %. */
  rateBp: integer().notNull(),
  name: text().notNull(),
});

export const products = pgTable("products", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: jsonb().$type<LocalizedText>().notNull(),
  active: boolean().notNull().default(true),
});

/**
 * Preise sind Bruttopreise für Verbraucher (inkl. MwSt.). Ein neuer Preis ist eine neue Zeile
 * mit neuem `validFrom`; alte Zeilen bleiben für die Nachvollziehbarkeit erhalten.
 */
export const prices = pgTable(
  "prices",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    grossCents: integer().notNull(),
    currency: text().notNull().default("EUR"),
    taxRateId: uuid()
      .notNull()
      .references(() => taxRates.id),
    validFrom: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.productId, t.validFrom)],
);
