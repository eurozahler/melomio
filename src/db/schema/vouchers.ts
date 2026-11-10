import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orders } from "./orders";

/** Gutscheine (C5): Prozent- oder Festbetrag-Rabatt, optional mit Ablaufdatum und Einlöse-Limit. */
export const vouchers = pgTable("vouchers", {
  id: uuid().primaryKey().defaultRandom(),
  /** immer in Großbuchstaben gespeichert, z. B. MUTTERTAG10 */
  code: text().notNull().unique(),
  kind: text().$type<"percent" | "fixed">().notNull(),
  /** percent: 1–100; fixed: Betrag in Cent (brutto) */
  value: integer().notNull(),
  /** Höchstzahl bezahlter Einlösungen insgesamt (null = unbegrenzt) */
  maxRedemptions: integer(),
  validUntil: timestamp({ withTimezone: true }),
  active: boolean().notNull().default(true),
  note: text(),
  createdBy: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Welcher Gutschein bei welcher Bestellung verwendet wurde (eine pro Bestellung). */
export const voucherRedemptions = pgTable("voucher_redemptions", {
  id: uuid().primaryKey().defaultRandom(),
  voucherId: uuid()
    .notNull()
    .references(() => vouchers.id),
  orderId: uuid()
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  discountCents: integer().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
