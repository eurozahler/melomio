/**
 * Spielt die Beispieldaten ein (wiederholbar, überschreibt nichts).
 * Aufruf: npm run db:seed            (Datenbank aus DATABASE_URL)
 *         npm run db:seed -- --test  (Testdatenbank aus DATABASE_URL_TEST)
 */
import { loadEnvConfig } from "@next/env";
import { createDb } from "../../src/db/client";
import { seed } from "../../src/db/seed";

loadEnvConfig(process.cwd());

async function main() {
  const useTest = process.argv.includes("--test");
  const url = useTest ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
  if (!url) throw new Error(`${useTest ? "DATABASE_URL_TEST" : "DATABASE_URL"} fehlt (siehe .env.example)`);
  console.log(`Beispieldaten werden eingespielt in: ${new URL(url).pathname.slice(1)}`);
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await seed(db);
  } finally {
    await pool.end();
  }
  console.log("✓ Beispieldaten vorhanden.");
}

main().catch((e) => {
  console.error("✗ Seed fehlgeschlagen:", e instanceof Error ? e.message : e);
  process.exit(1);
});
