import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { InvoiceLine, InvoiceParty, InvoiceSeller } from "./invoices";
import { orders } from "./orders";
import { users } from "./users";

/**
 * Affiliate-Programm: Partner bewerben sich mit ihren Daten, der Admin schaltet frei.
 * Freigeschaltete Partner erzeugen Codes; ein Code gibt dem Kunden Rabatt und dem Partner Provision.
 * Rabatt und Provision legt der Admin fest (Standard aus den Einstellungen, je Partner änderbar).
 */

export type AffiliateStatus = "pending" | "active" | "rejected" | "blocked";
/** Steuerliche Stellung des Partners – bestimmt, ob auf der Gutschrift Umsatzsteuer ausgewiesen wird. */
export type AffiliateTaxStatus = "private" | "small_business" | "vat_registered";

export const affiliates = pgTable(
  "affiliates",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .unique()
      .references(() => users.id),
    status: text().$type<AffiliateStatus>().notNull().default("pending"),
    fullName: text().notNull(),
    company: text(),
    street: text().notNull(),
    postalCode: text().notNull(),
    city: text().notNull(),
    country: text().notNull().default("Deutschland"),
    /** Wo und wie der Partner werben will (Kanäle, Reichweite) – Grundlage für die Freigabe. */
    channels: text().notNull(),
    accountHolder: text().notNull(),
    iban: text().notNull(),
    taxStatus: text().$type<AffiliateTaxStatus>().notNull(),
    vatId: text(),
    taxNumber: text(),
    /** Kundenrabatt in Prozent (null = Standard aus den Einstellungen). */
    discountPct: integer(),
    /** Provision in Prozent vom Nettobetrag (null = Standard aus den Einstellungen). */
    commissionPct: integer(),
    adminNote: text(),
    decidedAt: timestamp({ withTimezone: true }),
    decidedBy: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.status)],
);

export const affiliateCodes = pgTable(
  "affiliate_codes",
  {
    id: uuid().primaryKey().defaultRandom(),
    affiliateId: uuid()
      .notNull()
      .references(() => affiliates.id),
    /** immer Großbuchstaben; teilt sich den Namensraum mit den Gutscheinen */
    code: text().notNull().unique(),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.affiliateId)],
);

/** Welcher Affiliate-Code bei welcher Bestellung verwendet wurde (einer pro Bestellung, wie Gutscheine). */
export const affiliateAttributions = pgTable("affiliate_attributions", {
  id: uuid().primaryKey().defaultRandom(),
  codeId: uuid()
    .notNull()
    .references(() => affiliateCodes.id),
  orderId: uuid()
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  discountCents: integer().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * Provision je bezahlter Bestellung. „pending“ bis 30 Tage nach dem Kauf (Erstattungen möglich),
 * dann „payable“; mit einer Auszahlung „paid“. Erstattet → „canceled“.
 */
export type CommissionStatus = "pending" | "payable" | "paid" | "canceled";

export const affiliateCommissions = pgTable(
  "affiliate_commissions",
  {
    id: uuid().primaryKey().defaultRandom(),
    affiliateId: uuid()
      .notNull()
      .references(() => affiliates.id),
    orderId: uuid()
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "restrict" }),
    codeId: uuid()
      .notNull()
      .references(() => affiliateCodes.id),
    /** Nettobetrag der Bestellung (nach Rabatt, ohne MwSt.) – Grundlage der Provision. */
    baseNetCents: integer().notNull(),
    commissionPct: integer().notNull(),
    commissionCents: integer().notNull(),
    isTest: boolean().notNull(),
    status: text().$type<CommissionStatus>().notNull().default("pending"),
    payableAt: timestamp({ withTimezone: true }).notNull(),
    payoutId: uuid().references(() => affiliatePayouts.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.affiliateId, t.status)],
);

/**
 * Auszahlung (monatlich, per Überweisung) mit Gutschrift als PDF – fortlaufend nummeriert (GS-JJJJ-NNNNN),
 * nach dem Ausstellen unveränderlich (wie Rechnungen).
 */
export const affiliatePayouts = pgTable(
  "affiliate_payouts",
  {
    id: uuid().primaryKey().defaultRandom(),
    number: text().notNull().unique(),
    affiliateId: uuid()
      .notNull()
      .references(() => affiliates.id),
    isTest: boolean().notNull(),
    issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** melomio als Empfänger der Leistung (stellt die Gutschrift aus) */
    issuer: jsonb().$type<InvoiceSeller>().notNull(),
    /** Partner als leistender Unternehmer bzw. Privatperson */
    recipient: jsonb().$type<InvoiceParty & { vatId?: string | null; taxNumber?: string | null }>().notNull(),
    taxStatus: text().$type<AffiliateTaxStatus>().notNull(),
    lines: jsonb().$type<InvoiceLine[]>().notNull(),
    netCents: integer().notNull(),
    taxCents: integer().notNull(),
    grossCents: integer().notNull(),
    iban: text().notNull(),
    accountHolder: text().notNull(),
    storageKey: text().notNull(),
    paidAt: timestamp({ withTimezone: true }),
    paidBy: text(),
    createdBy: text(),
  },
  (t) => [index().on(t.affiliateId)],
);
