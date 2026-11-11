import { pgEnum } from "drizzle-orm/pg-core";

/** Mehrsprachiger Text, z. B. { de: "Geburtstag" }. Englisch kommt in Phase D dazu. */
export type LocalizedText = { de: string; en?: string };

export const roleEnum = pgEnum("role", ["owner", "admin", "support", "content_reviewer", "customer"]);

export const questionTypeEnum = pgEnum("question_type", [
  "text", // einzeilig
  "textarea", // mehrzeilig, Diktat über die Handy-Tastatur
  "single_choice",
  "multi_choice",
  "date",
]);

/**
 * Status einer Bestellung (docs/ARCHITEKTUR.md, Abschnitt 7).
 * Die erlaubten Übergänge regelt die Statusmaschine in Modul M4.
 */
export const orderStatusEnum = pgEnum("order_status", [
  "created",
  "lyrics_generating",
  "lyrics_review",
  "lyrics_approved",
  "music_generating",
  "manual_review",
  "preview_ready",
  "preview_expired",
  "awaiting_payment",
  "paid",
  "awaiting_choice",
  "video_rendering",
  "completed",
  "refunded",
  "failed",
  "canceled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "open",
  "pending",
  "authorized",
  "paid",
  "failed",
  "canceled",
  "expired",
]);

export const refundStatusEnum = pgEnum("refund_status", [
  "pending",
  "processing",
  "refunded",
  "failed",
  "canceled",
]);

export const modeEnum = pgEnum("operation_mode", ["test", "live"]);

export const consentTypeEnum = pgEnum("consent_type", [
  "terms_privacy", // AGB und Datenschutz
  "withdrawal_waiver", // sofortiger Leistungsbeginn, Verlust des Widerrufsrechts (E16)
  "publication", // Veröffentlichung über EasyGMV (Phase C)
  "publication_photos", // Fotos dürfen in die Veröffentlichung (E7)
  "publication_memorial", // Trauer: ausdrückliche Beauftragung (E15)
  "marketing",
]);

export const lyricsSourceEnum = pgEnum("lyrics_source", [
  "ai", // erste Fassung der KI
  "ai_revision", // „KI neu formulieren lassen“
  "customer_edit", // vom Kunden selbst bearbeitet
  "customer_own", // Kunde hat den Songtext komplett selbst geschrieben
]);

export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "succeeded", "failed", "canceled"]);

export const musicPhaseEnum = pgEnum("music_phase", ["preview", "post_purchase"]);

export const qcStatusEnum = pgEnum("qc_status", ["pending", "passed", "failed", "manual"]);

export const previewStartMethodEnum = pgEnum("preview_start_method", [
  "provider_sections", // Abschnittszeiten vom Anbieter
  "lyrics_structure", // geschätzt aus dem Aufbau des Songtexts
  "audio_analysis", // Gesang per Analyse erkannt
  "fallback", // Ersatzwert aus den Einstellungen
]);

export const selectedByEnum = pgEnum("selected_by", ["auto", "admin", "customer"]);

export const videoVariantEnum = pgEnum("video_variant", [
  "customer", // Video für den Kunden
  "publication", // Fassung für TikTok (ggf. ohne Fotos, E7)
]);

export const emailStatusEnum = pgEnum("email_status", ["queued", "sent", "delivered", "bounced", "failed"]);
