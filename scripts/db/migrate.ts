/**
 * Spielt alle noch fehlenden Migrationen in die Datenbank ein.
 * Aufruf: npm run db:migrate            (Datenbank aus DATABASE_URL)
 *         npm run db:migrate -- --test  (Testdatenbank aus DATABASE_URL_TEST)
 */
import { loadEnvConfig } from "@next/env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../../src/db/client";

loadEnvConfig(process.cwd());

export async function runMigrations(url: string) {
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
  } finally {
    await pool.end();
  }
}

async function main() {
  const useTest = process.argv.includes("--test");
  const url = useTest ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
  if (!url) throw new Error(`${useTest ? "DATABASE_URL_TEST" : "DATABASE_URL"} fehlt (siehe .env.example)`);
  const dbName = new URL(url).pathname.slice(1);
  console.log(`Migrationen werden eingespielt in: ${dbName}`);
  await runMigrations(url);
  console.log("✓ Migrationen aktuell.");
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/db/migrate.ts")) {
  main().catch((e) => {
    console.error("✗ Migration fehlgeschlagen:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
