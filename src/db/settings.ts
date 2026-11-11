import { z } from "zod";

/**
 * Alle Einstellungen, die im Admin geändert werden können (Tabelle app_settings).
 * Jede Einstellung hat einen Typ, Grenzen und einen Standardwert.
 * Die Werte für die erste Version stammen aus den Entscheidungen E4, E12, E13 und F-18.
 */
export const SETTINGS = {
  /** Kostenlose „KI neu formulieren lassen“-Durchgänge pro Bestellung (F-18). */
  lyrics_ai_revisions_free: { schema: z.number().int().min(0).max(10), default: 1 },
  /** Musik-Kandidaten vor der Zahlung (Hörprobe). */
  music_candidates_before_purchase: { schema: z.number().int().min(1).max(4), default: 1 },
  /** Zweite Song-Version nach der Zahlung, Kunde wählt seinen Favoriten (0 = aus, 1 = an). */
  music_extra_candidates_after_purchase: { schema: z.number().int().min(0).max(1), default: 1 },
  /** Nach so vielen Tagen ohne Auswahl wird automatisch die Version der Hörprobe genommen. */
  version_choice_days: { schema: z.number().int().min(1).max(30), default: 7 },
  /** Neue Musikversuche nach dem Kauf (F-18). */
  music_retries_after_purchase: { schema: z.number().int().min(0).max(5), default: 1 },
  /** Ziel-Songlänge in Sekunden (E4: etwa 3 Minuten). */
  song_target_duration_s: { schema: z.number().int().min(60).max(300), default: 180 },
  /** Länge der Hörprobe in Sekunden (E12). */
  preview_duration_s: { schema: z.number().int().min(5).max(60), default: 20 },
  /** Ersatz-Startpunkt der Hörprobe in Prozent der Songlänge, wenn keine Gesangsstelle erkannt wird (F-19). */
  preview_start_fallback_pct: { schema: z.number().int().min(0).max(90), default: 35 },
  /** Hörproben pro Konto (E11). */
  previews_per_account: { schema: z.number().int().min(0).max(20), default: 1 },
  /** Höchstzahl Hörproben pro Tag für alle Kunden zusammen (Kostenbremse, L16). */
  previews_daily_budget: { schema: z.number().int().min(0).max(10000), default: 50 },
  /** Nach so vielen Tagen ohne Kauf wird eine Hörprobe gelöscht. */
  preview_expiry_days: { schema: z.number().int().min(1).max(90), default: 14 },
  /** Laufzeit signierter Download-Links in Minuten. */
  download_link_ttl_min: { schema: z.number().int().min(5).max(1440), default: 60 },
  /** Veröffentlichung anbieten (0 = aus, 1 = an). */
  publication_enabled: { schema: z.number().int().min(0).max(1), default: 1 },
  /** Rabatt in % für die Zustimmung zur Veröffentlichung (Standard; je Anlass überschreibbar). */
  publication_discount_pct: { schema: z.number().int().min(0).max(50), default: 0 },
  /** Affiliate: Standard-Kundenrabatt in % (je Partner überschreibbar). */
  affiliate_discount_pct: { schema: z.number().int().min(0).max(50), default: 10 },
  /** Affiliate: Standard-Provision in % vom Nettobetrag (je Partner überschreibbar). */
  affiliate_commission_pct: { schema: z.number().int().min(0).max(50), default: 15 },
  /** Affiliate: Provision wird so viele Tage nach dem Kauf auszahlbar (Erstattungen abwarten). */
  affiliate_hold_days: { schema: z.number().int().min(0).max(90), default: 30 },
  /** Affiliate: Mindestbetrag für eine Auszahlung in Cent. */
  affiliate_min_payout_cents: { schema: z.number().int().min(0).max(100000), default: 2000 },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

/** Prüft einen Wert gegen die Regeln der Einstellung. Wirft bei ungültigen Werten. */
export function validateSetting<K extends SettingKey>(key: K, value: unknown): SettingValue<K> {
  return SETTINGS[key].schema.parse(value) as SettingValue<K>;
}
