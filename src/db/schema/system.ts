import { boolean, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { emailStatusEnum } from "./enums";
import { orders } from "./orders";
import { users } from "./users";

/** Nicht geheime Einstellungen je Anbieter (aktiv, Limits, Wiederholungsregeln). NIE Schlüssel. */
export const providerConfigs = pgTable(
  "provider_configs",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text().notNull(), // payment | lyrics | music | email | storage
    provider: text().notNull(),
    active: boolean().notNull().default(false),
    settings: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.kind, t.provider)],
);

/** Im Admin änderbare Einstellungen. Die Standardwerte und Typen stehen in src/db/settings.ts. */
export const appSettings = pgTable("app_settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedBy: text(),
});

export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => users.id, { onDelete: "set null" }),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    template: text().notNull(),
    recipient: text().notNull(),
    provider: text().notNull(),
    providerMessageId: text(),
    status: emailStatusEnum().notNull().default("queued"),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.orderId), index().on(t.userId)],
);

/** Wer hat wann was geändert (alter und neuer Wert). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorUserId: text().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    oldValue: jsonb(),
    newValue: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.entity, t.entityId), index().on(t.createdAt)],
);

/**
 * Test-Postfach: Nur im Testbetrieb (EMAIL_PROVIDER=console) landen E-Mails hier statt beim Empfänger.
 * Sichtbar unter /dev/mailbox. Im Livebetrieb wird diese Tabelle nicht beschrieben.
 */
export const devMailbox = pgTable(
  "dev_mailbox",
  {
    id: uuid().primaryKey().defaultRandom(),
    recipient: text().notNull(),
    subject: text().notNull(),
    template: text().notNull(),
    text: text().notNull(),
    html: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.recipient, t.createdAt)],
);
