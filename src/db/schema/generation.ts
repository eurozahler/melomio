import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import {
  jobStatusEnum,
  lyricsSourceEnum,
  musicPhaseEnum,
  previewStartMethodEnum,
  qcStatusEnum,
  selectedByEnum,
  videoVariantEnum,
} from "./enums";
import { orders } from "./orders";
import { users } from "./users";

/** Versionierte KI-Prompts mit Rollback (immer nur eine aktive Version je Schlüssel). */
export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    key: text().notNull(),
    version: integer().notNull(),
    template: text().notNull(),
    model: text().notNull(),
    active: boolean().notNull().default(false),
    createdBy: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.key, t.version)],
);

export type LyricsSection = { type: "verse" | "chorus" | "bridge" | "intro" | "outro"; lines: string[] };
export type LyricsContent = { sections: LyricsSection[] };

export const lyricsVersions = pgTable(
  "lyrics_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    title: text().notNull(),
    content: jsonb().$type<LyricsContent>().notNull(),
    source: lyricsSourceEnum().notNull(),
    promptVersionId: uuid().references(() => promptVersions.id),
    approvedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.orderId, t.version)],
);

export const musicJobs = pgTable(
  "music_jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    phase: musicPhaseEnum().notNull(),
    provider: text().notNull(),
    providerJobId: text(),
    /** Verhindert, dass derselbe Schritt doppelt ausgeführt (und doppelt bezahlt) wird. */
    idempotencyKey: text().notNull().unique(),
    status: jobStatusEnum().notNull().default("queued"),
    attempt: integer().notNull().default(0),
    costEstimateCents: integer(),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.orderId)],
);

export type MusicSection = { label: string; startMs: number; endMs: number };
/** Zeitstempel einer gesungenen Zeile (und, falls geliefert, ihrer Wörter) – für den Songtext im Video (C3). */
export type TimedLine = {
  startMs: number;
  endMs: number;
  text: string;
  words?: Array<{ startMs: number; endMs: number; text: string }>;
};

export const musicCandidates = pgTable(
  "music_candidates",
  {
    id: uuid().primaryKey().defaultRandom(),
    jobId: uuid()
      .notNull()
      .references(() => musicJobs.id, { onDelete: "cascade" }),
    /** Speicherort der VOLLEN Datei. Wird vor der Zahlung nie an den Browser ausgeliefert (E12). */
    storageKey: text().notNull(),
    durationMs: integer().notNull(),
    format: text().notNull(),
    qcStatus: qcStatusEnum().notNull().default("pending"),
    qcResult: jsonb().$type<Record<string, unknown>>(),
    /** Abschnittszeiten, falls der Anbieter sie liefert (F-19). */
    sections: jsonb().$type<MusicSection[]>(),
    /** Zeilen mit Zeitstempeln, falls der Anbieter sie liefert (Songtext im Video). */
    lyricsTiming: jsonb().$type<TimedLine[]>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.jobId)],
);

/** Die 20-Sekunden-Hörprobe mit Wasserzeichen (E12) – die einzige Audiodatei vor der Zahlung. */
export const previewClips = pgTable("preview_clips", {
  id: uuid().primaryKey().defaultRandom(),
  candidateId: uuid()
    .notNull()
    .unique()
    .references(() => musicCandidates.id, { onDelete: "cascade" }),
  storageKey: text().notNull(),
  startMs: integer().notNull(),
  durationMs: integer().notNull(),
  startMethod: previewStartMethodEnum().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * Protokoll jeder erzeugten Hörprobe. Grundlage für das Limit pro Konto und das Tagesbudget.
 * Bleibt erhalten, auch wenn die Dateien einer abgelaufenen Hörprobe gelöscht werden.
 */
export const previewUsage = pgTable(
  "preview_usage",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid()
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "cascade" }),
    costEstimateCents: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId), index().on(t.createdAt)],
);

export const selectedTracks = pgTable("selected_tracks", {
  orderId: uuid()
    .primaryKey()
    .references(() => orders.id, { onDelete: "cascade" }),
  candidateId: uuid()
    .notNull()
    .references(() => musicCandidates.id),
  selectedBy: selectedByEnum().notNull(),
  selectedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const videoTemplates = pgTable("video_templates", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  config: jsonb().$type<Record<string, unknown>>().notNull(),
  active: boolean().notNull().default(true),
});

export const videoJobs = pgTable(
  "video_jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    templateId: uuid()
      .notNull()
      .references(() => videoTemplates.id),
    variant: videoVariantEnum().notNull().default("customer"),
    format: text().notNull().default("1080x1920"),
    idempotencyKey: text().notNull().unique(),
    status: jobStatusEnum().notNull().default("queued"),
    attempt: integer().notNull().default(0),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.orderId)],
);

export const videos = pgTable("videos", {
  id: uuid().primaryKey().defaultRandom(),
  orderId: uuid()
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  jobId: uuid()
    .notNull()
    .unique()
    .references(() => videoJobs.id, { onDelete: "cascade" }),
  variant: videoVariantEnum().notNull(),
  storageKey: text().notNull(),
  width: integer().notNull(),
  height: integer().notNull(),
  durationMs: integer().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Teilbare Song-Seite mit QR-Code (E17). Der Kunde kann sie jederzeit abschalten. */
export const sharePages = pgTable("share_pages", {
  id: uuid().primaryKey().defaultRandom(),
  orderId: uuid()
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  /** Lange Zufallskennung im Link – nicht zu erraten. */
  token: text().notNull().unique(),
  active: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp({ withTimezone: true }),
});
