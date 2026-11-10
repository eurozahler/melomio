import { existsSync } from "node:fs";

/**
 * Next.js lädt .env.local im Testmodus absichtlich nicht. Die Integrationstests brauchen aber
 * DATABASE_URL_TEST daraus, deshalb wird die Datei hier direkt eingelesen.
 * Bereits gesetzte Umgebungsvariablen werden nicht überschrieben.
 */
export function loadLocalEnv() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  // Tests verschicken nie echte E-Mails (sonst: SMTP-Versand an Testadressen) – immer ins Test-Postfach
  process.env.EMAIL_PROVIDER = "console";
}
