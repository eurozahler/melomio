import { defineConfig } from "vitest/config";

/**
 * Integrationstests gegen die echte Testdatenbank (melomio_test).
 * Voraussetzung: Tunnel offen (scripts/db-tunnel.ps1), DATABASE_URL_TEST in .env.local.
 * Die Testdatenbank wird vor jedem Lauf komplett geleert und neu aufgebaut.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
