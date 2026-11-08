import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/config/env";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>["db"];

/** Erstellt eine Datenbankverbindung (Pool). Für Skripte und Tests mit eigener URL. */
export function createDb(connectionString: string, options: { max?: number } = {}) {
  const pool = new Pool({ connectionString, max: options.max ?? 10 });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return { db, pool };
}

let shared: ReturnType<typeof createDb> | undefined;

/** Gemeinsame Verbindung der laufenden App (wird beim ersten Zugriff geöffnet). */
export function getDb(): Database {
  shared ??= createDb(getEnv().DATABASE_URL);
  return shared.db;
}
