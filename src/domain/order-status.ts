/**
 * Statusmaschine der Bestellung (docs/ARCHITEKTUR.md, Abschnitt 7).
 * Nur die hier aufgeführten Übergänge sind erlaubt. Alles andere lehnt der Code ab.
 */

export const ORDER_STATUSES = [
  "created",
  "lyrics_generating",
  "lyrics_review",
  "lyrics_approved",
  "music_generating",
  "manual_review",
  "preview_ready",
  "preview_expired",
  "awaiting_payment",
  "paid",
  "video_rendering",
  "completed",
  "refunded",
  "failed",
  "canceled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Erlaubte Übergänge: von → nach. */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  created: ["lyrics_generating", "lyrics_review", "canceled", "failed"],
  lyrics_generating: ["lyrics_review", "failed"],
  // „KI neu formulieren“ führt zurück zur Erzeugung
  lyrics_review: ["lyrics_generating", "lyrics_approved", "canceled"],
  lyrics_approved: ["music_generating", "failed"],
  // vor der Zahlung → Hörprobe; nach der Zahlung (Neuversuch) → direkt zum Video
  music_generating: ["preview_ready", "manual_review", "video_rendering", "failed"],
  // Admin gibt einen unsicheren Kandidaten frei → Hörprobe wird im Musik-Schritt erstellt
  manual_review: ["music_generating", "preview_ready", "video_rendering", "failed", "canceled"],
  preview_ready: ["awaiting_payment", "preview_expired", "canceled"],
  preview_expired: [],
  // Zahlung fehlgeschlagen oder abgebrochen → zurück zur Hörprobe
  awaiting_payment: ["paid", "preview_ready", "canceled"],
  paid: ["video_rendering", "refunded", "failed"],
  video_rendering: ["completed", "failed"],
  // Neuversuch der Musik nach dem Kauf (Limit aus den Einstellungen)
  completed: ["music_generating", "refunded"],
  refunded: [],
  // Admin „Schritt wiederholen“: zurück in einen Arbeitsschritt
  failed: [
    "created",
    "lyrics_generating",
    "lyrics_approved",
    "music_generating",
    "paid",
    "video_rendering",
    "canceled",
  ],
  canceled: [],
};

/** Zustände, in denen im Hintergrund gearbeitet wird (Anzeige: „läuft …“). */
export const WORKING_STATUSES: readonly OrderStatus[] = [
  "created",
  "lyrics_generating",
  "music_generating",
  "paid",
  "video_rendering",
];

/** Bestellungen, die noch nicht bezahlt und nicht abgeschlossen sind (für das Limit offener Bestellungen). */
export const OPEN_UNPAID_STATUSES: readonly OrderStatus[] = [
  "created",
  "lyrics_generating",
  "lyrics_review",
  "lyrics_approved",
  "music_generating",
  "manual_review",
  "preview_ready",
  "awaiting_payment",
];

/** Diese Ziele setzen eine bestätigte Zahlung voraus (E12: Video erst nach der Zahlung). */
const REQUIRES_PAYMENT: readonly OrderStatus[] = ["paid", "video_rendering", "completed"];

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
    reason: string,
  ) {
    super(`Unerlaubter Statuswechsel ${from} → ${to}: ${reason}`);
    this.name = "IllegalTransitionError";
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Wirft, wenn der Übergang nicht erlaubt ist. `paid` = Zahlung ist serverseitig bestätigt. */
export function assertTransition(from: OrderStatus, to: OrderStatus, context: { paid: boolean }): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to, "nicht vorgesehen");
  if (REQUIRES_PAYMENT.includes(to) && !context.paid) {
    throw new IllegalTransitionError(from, to, "Zahlung ist nicht bestätigt");
  }
}
