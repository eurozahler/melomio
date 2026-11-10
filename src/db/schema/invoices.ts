import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { users } from "./users";

/**
 * Rechnungen (GoBD): fortlaufend nummeriert, nach dem Ausstellen unveränderlich, nie gelöscht.
 * Korrekturen nur über eine Stornorechnung, die auf die ursprüngliche Rechnung verweist.
 * Alle Angaben (Verkäufer, Käufer, Positionen) werden beim Ausstellen eingefroren.
 */

export type InvoiceParty = {
  name: string;
  lines: string[];
  email?: string | null;
};

export type InvoiceSeller = InvoiceParty & {
  managingDirector: string;
  register: string | null;
  vatId: string | null;
  taxNumber: string | null;
  phone: string | null;
  website: string | null;
};

export type InvoiceLine = {
  description: string;
  quantity: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
  taxRateBp: number;
};

export const invoices = pgTable(
  "invoices",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** z. B. RE-2026-00001 (Testbetrieb: TEST-RE-2026-00001, eigener Nummernkreis). */
    number: text().notNull().unique(),
    kind: text().$type<"invoice" | "cancellation">().notNull(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    userId: text().references(() => users.id, { onDelete: "set null" }),
    /** Bei Stornorechnungen: die stornierte Rechnung. */
    cancelsInvoiceId: uuid().references((): AnyPgColumn => invoices.id, { onDelete: "restrict" }),
    isTest: boolean().notNull(),
    issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    serviceDate: timestamp({ withTimezone: true }).notNull(),
    seller: jsonb().$type<InvoiceSeller>().notNull(),
    buyer: jsonb().$type<InvoiceParty>().notNull(),
    lines: jsonb().$type<InvoiceLine[]>().notNull(),
    netCents: integer().notNull(),
    taxCents: integer().notNull(),
    grossCents: integer().notNull(),
    currency: text().notNull(),
    paymentNote: text(),
    reason: text(),
    storageKey: text().notNull(),
  },
  (t) => [index().on(t.orderId), index().on(t.issuedAt)],
);

/** Letzte vergebene Nummer je Nummernkreis und Jahr – lückenlos durch Sperre beim Hochzählen. */
export const invoiceCounters = pgTable(
  "invoice_counters",
  {
    series: text().notNull(),
    year: integer().notNull(),
    last: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.series, t.year] })],
);
