import "server-only";
import type { PgBoss } from "pg-boss";
import { getEnv } from "@/config/env";
import { createBoss } from "@/jobs/boss";

let starting: Promise<PgBoss> | undefined;

/**
 * pg-boss für die Web-App: legt nur Aufträge an (keine Wartung, keine Zeitpläne – das macht der Worker).
 * Wird beim ersten Gebrauch gestartet und danach wiederverwendet.
 */
export function getSenderBoss(): Promise<PgBoss> {
  starting ??= (async () => {
    const boss = createBoss(getEnv().DATABASE_URL, "sender");
    await boss.start();
    return boss;
  })().catch((error) => {
    starting = undefined; // beim nächsten Versuch neu verbinden
    throw error;
  });
  return starting;
}
