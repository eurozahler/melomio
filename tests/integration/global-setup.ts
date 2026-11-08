import { loadLocalEnv } from "./load-env";
import { Client } from "pg";
import { runMigrations } from "../../scripts/db/migrate";

/** Leert die Testdatenbank und spielt alle Migrationen neu ein (simuliert eine leere Datenbank). */
export default async function setup() {
  loadLocalEnv();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST fehlt – Integrationstests brauchen die Testdatenbank");
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`Sicherheitsstopp: ${dbName} ist keine Testdatenbank (Name muss auf _test enden)`);
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
  } catch (e) {
    throw new Error(
      `Testdatenbank nicht erreichbar. Ist der Tunnel offen (scripts/db-tunnel.ps1)? Ursache: ${e instanceof Error ? e.message : e}`,
    );
  }
  await client.query(
    "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;",
  );
  await client.end();

  await runMigrations(url);
}
