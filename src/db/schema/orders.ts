import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { consentTypeEnum, modeEnum, orderStatusEnum, paymentStatusEnum, refundStatusEnum } from "./enums";
import { genres, moods, occasions, products, questionnaireVersions, questions, voices } from "./catalog";
import { users } from "./users";

/** Rechnungsanschrift für Firmenkunden (Prüfung: src/orders/billing.ts). */
export type BillingAddress = {
  company: string;
  contact: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  vatId: string;
};

/** Wahl des Kunden zur freiwilligen Veröffentlichung (C7), beim Kauf festgelegt. */
export type PublicationChoice = {
  /** Fotos dürfen ins veröffentlichte Video (Kunde bestätigt die Einwilligung der Abgebildeten). */
  photos: boolean;
  /** Songtitel (enthält oft Namen) wird im veröffentlichten Video gezeigt. */
  title: boolean;
};

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Kurze, gut lesbare Bestellnummer für Kunde und Support, z. B. "M-7K3P9Q". */
    publicRef: text().notNull().unique(),
    status: orderStatusEnum().notNull().default("created"),
    userId: text()
      .notNull()
      .references(() => users.id),
    locale: text().notNull().default("de"),
    occasionId: uuid()
      .notNull()
      .references(() => occasions.id),
    questionnaireVersionId: uuid()
      .notNull()
      .references(() => questionnaireVersions.id),
    genreId: uuid().references(() => genres.id),
    moodId: uuid().references(() => moods.id),
    voiceId: uuid().references(() => voices.id),
    songLanguage: text().notNull().default("de"),
    /** Kunde schreibt den Songtext selbst (E17). */
    customLyrics: boolean().notNull().default(false),
    isTest: boolean().notNull(),
    /** Zeitpunkt der serverseitig bestätigten Zahlung. Voraussetzung für Video und volle Datei (E12). */
    paidAt: timestamp({ withTimezone: true }),
    /** Rechnungsanschrift für Firmenkunden (optional, beim Kauf angegeben). */
    billing: jsonb().$type<BillingAddress | null>(),
    /** Zustimmung zur Veröffentlichung (null = keine Veröffentlichung). */
    publication: jsonb().$type<PublicationChoice | null>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.status)],
);

/** Nachvollziehbare Statushistorie: jeder Übergang mit Zeitpunkt und Auslöser. */
export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum(),
    toStatus: orderStatusEnum().notNull(),
    reason: text(),
    /** "system", "worker", "webhook" oder eine Benutzer-ID */
    actor: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.orderId, t.at)],
);

export const answers = pgTable(
  "answers",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id),
    value: jsonb().$type<string | string[]>().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.orderId, t.questionId)],
);

export const orderItems = pgTable("order_items", {
  id: uuid().primaryKey().defaultRandom(),
  orderId: uuid()
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid()
    .notNull()
    .references(() => products.id),
  quantity: integer().notNull().default(1),
  unitGrossCents: integer().notNull(),
});

export type PriceSnapshotItem = {
  productSlug: string;
  name: string;
  quantity: number;
  unitGrossCents: number;
};

/**
 * Unveränderlicher Preis zum Zeitpunkt der Bestellung.
 * Ein Datenbank-Trigger verhindert jede nachträgliche Änderung (Migration 0001).
 */
export const priceSnapshots = pgTable("price_snapshots", {
  id: uuid().primaryKey().defaultRandom(),
  orderId: uuid()
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  items: jsonb().$type<PriceSnapshotItem[]>().notNull(),
  netCents: integer().notNull(),
  taxCents: integer().notNull(),
  grossCents: integer().notNull(),
  taxRateBp: integer().notNull(),
  currency: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    provider: text().notNull(),
    providerPaymentId: text().notNull(),
    status: paymentStatusEnum().notNull().default("open"),
    amountCents: integer().notNull(),
    currency: text().notNull(),
    mode: modeEnum().notNull(),
    /** Bezahlseite des Anbieters – für „Zur Zahlung zurück“, ohne eine zweite Zahlung anzulegen. */
    checkoutUrl: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.provider, t.providerPaymentId), index().on(t.orderId)],
);

/** Webhook-Protokoll. Sorgt dafür, dass ein Ereignis nur einmal verarbeitet wird. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    providerPaymentId: text().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Status, den der Server selbst beim Anbieter abgefragt hat (nie aus dem Webhook übernommen). */
    fetchedStatus: text(),
    processedAt: timestamp({ withTimezone: true }),
    error: text(),
  },
  (t) => [index().on(t.provider, t.providerPaymentId)],
);

export const refunds = pgTable("refunds", {
  id: uuid().primaryKey().defaultRandom(),
  paymentId: uuid()
    .notNull()
    .references(() => payments.id),
  providerRefundId: text(),
  amountCents: integer().notNull(),
  status: refundStatusEnum().notNull().default("pending"),
  reason: text(),
  actor: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Einwilligungen mit Textversion, Zeitpunkt und Widerruf. */
export const consents = pgTable(
  "consents",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => users.id),
    orderId: uuid().references(() => orders.id),
    type: consentTypeEnum().notNull(),
    textVersion: text().notNull(),
    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
    /** Gehashte IP-Adresse als Nachweis, ohne die IP selbst zu speichern. */
    ipHash: text(),
  },
  (t) => [index().on(t.userId), index().on(t.orderId, t.type)],
);
