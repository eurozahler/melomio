import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { readHeartbeat } from "@/monitoring/watchdog";

/**
 * Statusabfrage für die Überwachung von außen (z. B. ein Uptime-Dienst):
 * 200 = Webseite, Datenbank und Worker laufen; 503 = etwas stimmt nicht.
 * Gibt bewusst nur Ja/Nein-Angaben preis.
 */
export async function GET() {
  let db = false;
  let worker = false;
  try {
    await getDb().execute(sql`select 1`);
    db = true;
    const beat = await readHeartbeat(getDb());
    worker = !!beat && Date.now() - beat.at.getTime() < 5 * 60_000;
  } catch {
    // db bleibt false
  }
  const ok = db && worker;
  return Response.json(
    { ok, db, worker },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
