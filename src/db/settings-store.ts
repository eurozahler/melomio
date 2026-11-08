import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { appSettings } from "./schema";
import { SETTINGS, type SettingKey, type SettingValue } from "./settings";

/**
 * Liest eine Einstellung aus der Datenbank. Fehlt sie oder ist sie ungültig, gilt der Standardwert –
 * eine kaputte Einstellung darf den Betrieb nicht lahmlegen.
 */
export async function getSetting<K extends SettingKey>(db: Database, key: K): Promise<SettingValue<K>> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  const parsed = SETTINGS[key].schema.safeParse(row?.value);
  return (parsed.success ? parsed.data : SETTINGS[key].default) as SettingValue<K>;
}
