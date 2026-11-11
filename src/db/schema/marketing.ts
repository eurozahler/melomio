import { boolean, date, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { occasions } from "./catalog";
import { users } from "./users";

/**
 * Marketing (Landingpages, Auswertung, Werbekosten).
 * Besucherzahlen werden nur als Tagessummen gespeichert – ohne IP-Adresse, ohne Cookie, ohne Person.
 */

export type LandingSection = { heading: string; body: string };
export type LandingFaq = { q: string; a: string };
/** Variante für eine Werbekampagne: erreichbar über ?k=<key>, ändert Überschrift und Einleitung. */
export type LandingVariant = { key: string; h1: string; intro: string };

/** Eine Landingpage je Anlass (erreichbar unter /lieder/<slug>). */
export const landingPages = pgTable("landing_pages", {
  id: uuid().primaryKey().defaultRandom(),
  occasionId: uuid()
    .notNull()
    .unique()
    .references(() => occasions.id, { onDelete: "cascade" }),
  slug: text().notNull().unique(),
  published: boolean().notNull().default(false),
  /** Titel im Browser-Tab und bei Google (ideal 50–60 Zeichen). */
  metaTitle: text().notNull().default(""),
  /** Beschreibung bei Google (ideal 140–160 Zeichen). */
  metaDescription: text().notNull().default(""),
  h1: text().notNull().default(""),
  intro: text().notNull().default(""),
  /** Kurze Vorteile als Aufzählung. */
  highlights: jsonb().$type<string[]>().notNull().default([]),
  sections: jsonb().$type<LandingSection[]>().notNull().default([]),
  faqs: jsonb().$type<LandingFaq[]>().notNull().default([]),
  variants: jsonb().$type<LandingVariant[]>().notNull().default([]),
  ctaLabel: text().notNull().default(""),
  /** Hörbeispiel (MP3 im Speicher), optional. */
  sampleAudioKey: text(),
  sampleTitle: text(),
  updatedBy: text().references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Seitenaufrufe als Tagessummen je Seite und Herkunft (keine personenbezogenen Daten). */
export const pageViewStats = pgTable(
  "page_view_stats",
  {
    day: date().notNull(),
    path: text().notNull(),
    source: text().notNull(),
    medium: text().notNull(),
    campaign: text().notNull(),
    views: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.path, t.source, t.medium, t.campaign] })],
);

/** Werbekosten je Monat, Quelle und Kampagne (vom Admin eingetragen). */
export const adCosts = pgTable(
  "ad_costs",
  {
    id: uuid().primaryKey().defaultRandom(),
    month: text().notNull(),
    source: text().notNull(),
    campaign: text().notNull().default(""),
    costCents: integer().notNull(),
    note: text(),
    createdBy: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.month, t.source, t.campaign)],
);
