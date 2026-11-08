import { EnvError, getEnv } from "@/config/env";

/**
 * Startprüfung (nur Node.js): Bei fehlerhafter Konfiguration oder verletzter
 * Startsperre wird der Server sofort beendet, statt mit falschen Einstellungen zu laufen.
 */
try {
  const env = getEnv();
  const mode = env.isTestOperation ? "TESTBETRIEB" : "LIVEBETRIEB";
  console.log(`[melomio] Konfiguration geprüft – ${mode} (APP_MODE=${env.APP_MODE})`);
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
