import { PgBoss } from "pg-boss";

/**
 * pg-boss-Instanzen. Die Warteschlange liegt in derselben PostgreSQL-Datenbank (Schema "pgboss"),
 * es wird kein zusätzlicher Dienst gebraucht.
 *
 * Rollen:
 * - "worker":  arbeitet Aufträge ab, überwacht Zeitüberschreitungen, führt Zeitpläne aus
 * - "sender":  legt nur Aufträge an (Web-App) – keine Wartung, keine Zeitpläne
 * - "migrate": installiert/aktualisiert das pg-boss-Schema (npm run db:migrate)
 */
export function createBoss(connectionString: string, role: "worker" | "sender" | "migrate"): PgBoss {
  const boss = new PgBoss({
    connectionString,
    application_name: `melomio-${role}`,
    max: role === "worker" ? 5 : 2,
    migrate: role !== "sender",
    supervise: role === "worker",
    schedule: role === "worker",
    // Zeitüberschreitungen und ausbleibende Lebenszeichen alle 15 Sekunden prüfen (Standard: 60)
    monitorIntervalSeconds: 15,
  });
  boss.on("error", (error) => console.error(`[pg-boss/${role}]`, error));
  return boss;
}
