import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-End-Tests im echten Browser, in Handy-Größe.
 * - Eigener Produktions-Build in .next-e2e (stört den Entwicklungsserver nicht)
 * - Läuft gegen die TESTdatenbank (DATABASE_URL_TEST), die vorher neu aufgebaut wird
 * - Voraussetzung: Tunnel offen (scripts/db-tunnel.ps1)
 */
process.loadEnvFile?.(".env.local");
const testDb = process.env.DATABASE_URL_TEST;
if (!testDb) throw new Error("DATABASE_URL_TEST fehlt (.env.local)");

const PORT = 3200;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "de-DE",
    trace: "retain-on-failure",
  },
  projects: [{ name: "handy", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: { NEXT_DIST_DIR: ".next-e2e", DATABASE_URL: testDb, APP_MODE: "test" },
  },
});
