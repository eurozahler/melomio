import { sql } from "drizzle-orm";
import { Client } from "pg";
import { createDb } from "../../src/db/client";
import { seed } from "../../src/db/seed";
import { runMigrations } from "../../scripts/db/migrate";

/** Baut die Testdatenbank neu auf: leeren, Migrationen einspielen, Beispieldaten einspielen. */
export default async function globalSetup() {
  process.loadEnvFile?.(".env.local");
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST fehlt");
  if (!new URL(url).pathname.endsWith("_test")) throw new Error("Sicherheitsstopp: keine Testdatenbank");

  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(
    "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;",
  );
  // Der Test-Worker läuft evtl. schon: Warteschlangen-Bereich behalten, nur alte Aufträge entfernen
  await client.query(
    "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = 'job') THEN DELETE FROM pgboss.job; END IF; END $$;",
  );
  await client.end();

  await runMigrations(url);
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await seed(db);
    // Kurze Test-Songs (60 s), damit Musik und Video in den Browser-Tests schnell entstehen
    await db.execute(
      sql`insert into app_settings (key, value, updated_by) values ('song_target_duration_s', '60', 'e2e') on conflict (key) do update set value = '60'`,
    );
  } finally {
    await pool.end();
  }
}
