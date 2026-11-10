import { count, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { appSettings, orders, previewUsage } from "@/db/schema";
import { getSetting } from "@/db/settings-store";
import type { OrderStatus } from "@/domain/order-status";
import type { MusicProvider } from "@/music/types";
import { sendAlert } from "./alerts";

/**
 * Wächter (C9), läuft alle 15 Minuten im Worker:
 * - hängende Bestellungen (zu lange in einem Arbeitsschritt)
 * - Hörproben-Tagesbudget fast aufgebraucht (Kostenbremse)
 * - Guthaben beim Musikanbieter niedrig
 * Außerdem schreibt der Worker jede Minute ein Lebenszeichen (für /api/health und das Admin).
 */

const WORKING: OrderStatus[] = ["lyrics_generating", "music_generating", "paid", "video_rendering"];
export const STUCK_AFTER_MIN = 30;
export const HEARTBEAT_KEY = "worker_heartbeat";

export async function writeHeartbeat(db: Database, version: string) {
  const value = { at: new Date().toISOString(), version };
  await db
    .insert(appSettings)
    .values({ key: HEARTBEAT_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

export async function readHeartbeat(db: Database): Promise<{ at: Date; version: string } | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, HEARTBEAT_KEY));
  const v = row?.value as { at?: string; version?: string } | undefined;
  return v?.at ? { at: new Date(v.at), version: v.version ?? "?" } : null;
}

export async function runWatchdog(
  db: Database,
  music: Pick<MusicProvider, "name" | "getBalanceCents">,
  opts: { lowBalanceCents?: number; now?: Date } = {},
) {
  const now = opts.now ?? new Date();
  const findings: string[] = [];

  // 1. Hängende Bestellungen
  const stuck = await db
    .select({ ref: orders.publicRef, status: orders.status, test: orders.isTest })
    .from(orders)
    .where(
      sql`${inArray(orders.status, WORKING)} and (select max(h.at) from order_status_history h where h.order_id = ${orders.id}) < ${new Date(now.getTime() - STUCK_AFTER_MIN * 60_000)}`,
    );
  if (stuck.length) {
    findings.push(`${stuck.length} hängende Bestellungen`);
    await sendAlert(db, `stuck:${stuck.map((s) => s.ref).join(",")}`.slice(0, 100), "Bestellungen hängen", [
      `Diese Bestellungen stehen seit über ${STUCK_AFTER_MIN} Minuten im selben Arbeitsschritt:`,
      ...stuck.map((s) => `${s.ref} – ${s.status}${s.test ? " (Test)" : ""}`),
      "Läuft der Worker? Admin → Bestellungen prüfen.",
    ]);
  }

  // 2. Kostenbremse: Hörproben heute
  const budget = await getSetting(db, "previews_daily_budget");
  const today = sql`(date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')`;
  const [used] = await db.select({ n: count() }).from(previewUsage).where(gte(previewUsage.createdAt, today));
  const n = used?.n ?? 0;
  if (budget > 0 && n >= Math.ceil(budget * 0.8)) {
    findings.push(`Tagesbudget ${n}/${budget}`);
    await sendAlert(db, "preview-budget", "Hörproben-Tagesbudget fast erreicht", [
      `Heute ${n} von ${budget} Hörproben verbraucht.`,
      "Ist das Budget erreicht, bekommen neue Kunden heute keine Hörprobe mehr. Anpassen unter Admin → Einstellungen.",
    ]);
  }

  // 3. Guthaben beim Musikanbieter
  const threshold = opts.lowBalanceCents ?? 300;
  if (music.getBalanceCents) {
    const balance = await music.getBalanceCents().catch(() => null);
    if (balance !== null && balance < threshold) {
      findings.push(`Guthaben ${balance} ct`);
      await sendAlert(db, `balance:${music.name}`, `Guthaben bei ${music.name} niedrig`, [
        `Restguthaben: ${(balance / 100).toFixed(2)} $ (Warnschwelle ${(threshold / 100).toFixed(2)} $).`,
        "Bitte im Anbieter-Konto aufladen – sonst schlagen neue Songs fehl.",
      ]);
    }
  }
  return findings;
}

/** Zustand des Workers für Anzeigen: Alter des letzten Lebenszeichens in Minuten. */
export async function workerStatus(db: Database, maxAgeMin = 5) {
  const beat = await readHeartbeat(db);
  const ageMin = beat ? Math.floor((Date.now() - beat.at.getTime()) / 60_000) : null;
  return { version: beat?.version ?? null, ageMin, ok: ageMin !== null && ageMin < maxAgeMin };
}
