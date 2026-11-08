import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { roleEnum } from "./enums";

/**
 * Benutzer (Admins und Kunden).
 * Die Spalten id, name, email, emailVerified, image, createdAt, updatedAt erwartet die
 * Login-Bibliothek Better Auth (Modul M3b).
 */
export const users = pgTable("users", {
  id: text().primaryKey(),
  name: text().notNull().default(""),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  locale: text().notNull().default("de"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Anmeldesitzungen (Better Auth). Das Cookie enthält nur das signierte Token. */
export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index().on(t.userId)],
);

/** Anmeldearten je Benutzer (Better Auth). Bei E-Mail + Passwort steht hier der Passwort-Hash (scrypt). */
export const accounts = pgTable(
  "accounts",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
);

/** Einmal-Tokens für E-Mail-Bestätigung, E-Mail-Link und Passwort-Zurücksetzen (Better Auth). */
export const verifications = pgTable(
  "verifications",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.identifier)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

/**
 * Fragebogen-Entwurf vor der Anmeldung (E11). Wird über ein Cookie wiedererkannt,
 * beim Login dem Konto zugeordnet und nach Ablauf gelöscht.
 */
export const questionnaireDrafts = pgTable(
  "questionnaire_drafts",
  {
    id: uuid().primaryKey().defaultRandom(),
    cookieId: text().notNull().unique(),
    userId: text().references(() => users.id, { onDelete: "cascade" }),
    occasionId: uuid(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId), index().on(t.expiresAt)],
);
