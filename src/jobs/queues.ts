import type { PgBoss, QueueOptions } from "pg-boss";

/**
 * Alle Warteschlangen mit ihren Wiederholungsregeln (docs/ARCHITEKTUR.md, Abschnitt 7).
 * Lange Arbeit (Songtext, Musik, Video, E-Mail) läuft nie im Webrequest, sondern im Worker.
 */
export const QUEUES = {
  /** Startet die Verarbeitung einer neuen Bestellung. */
  orderStart: "order.start",
  /** Songtext erzeugen (Modul M5: echter Text; bis dahin Platzhalter-Schritt). */
  lyricsGenerate: "lyrics.generate",
  /** Aufräumen: abgelaufene Fragebogen-Entwürfe löschen. */
  cleanupDrafts: "maintenance.cleanup-drafts",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type OrderJobData = { orderId: string };

export const QUEUE_OPTIONS: Record<QueueName, QueueOptions> = {
  // heartbeatSeconds: Der Worker meldet sich regelmäßig. Bleibt das aus (Absturz), wird der Auftrag
  // nach dieser Zeit erneut vergeben – statt erst nach Ablauf von expireInSeconds.
  [QUEUES.orderStart]: {
    retryLimit: 3,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 120,
    heartbeatSeconds: 30,
  },
  [QUEUES.lyricsGenerate]: {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 300,
    heartbeatSeconds: 30,
  },
  [QUEUES.cleanupDrafts]: { retryLimit: 2, retryDelay: 300, expireInSeconds: 600 },
};

/** Legt fehlende Warteschlangen an und überträgt geänderte Regeln auf vorhandene. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const [name, options] of Object.entries(QUEUE_OPTIONS)) {
    const existing = await boss.getQueue(name);
    if (!existing) {
      await boss.createQueue(name, options);
      continue;
    }
    // heartbeatSeconds lässt sich bei pg-boss nur beim Anlegen festlegen
    const { heartbeatSeconds, ...changeable } = options;
    await boss.updateQueue(name, changeable);
    if ((existing.heartbeatSeconds ?? undefined) !== heartbeatSeconds) {
      console.warn(
        `[pg-boss] Warteschlange ${name}: heartbeatSeconds ist ${existing.heartbeatSeconds ?? "aus"}, erwartet ${heartbeatSeconds ?? "aus"} – Warteschlange neu anlegen`,
      );
    }
  }
}
