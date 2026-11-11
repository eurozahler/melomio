import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { videos } from "./generation";

/**
 * Veröffentlichung über EasyGMV (C7): Das Video wird nach Admin-Freigabe in einen Dropbox-Ordner
 * hochgeladen (Ordner je Anlass, sonst Standardordner); EasyGMV holt es dort ab.
 *
 * Ablauf: rendering → awaiting_approval → (approved →) uploaded
 *         awaiting_approval → rejected · jederzeit → withdrawn (Kunde widerruft)
 */
export type PublicationStatus =
  "rendering" | "awaiting_approval" | "approved" | "uploaded" | "rejected" | "withdrawn" | "failed";

export const publications = pgTable(
  "publications",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: text().$type<PublicationStatus>().notNull().default("rendering"),
    /** Video, das veröffentlicht wird (eigene Fassung oder das Kundenvideo, wenn identisch). */
    videoId: uuid().references(() => videos.id, { onDelete: "set null" }),
    /** Zielordner zum Zeitpunkt der Freigabe, z. B. /Liebe */
    targetFolder: text(),
    /** Tatsächlicher Pfad der hochgeladenen Datei beim Anbieter */
    remotePath: text(),
    decidedBy: text(),
    decidedAt: timestamp({ withTimezone: true }),
    uploadedAt: timestamp({ withTimezone: true }),
    withdrawnAt: timestamp({ withTimezone: true }),
    note: text(),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.status)],
);
