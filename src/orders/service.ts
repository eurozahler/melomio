import { randomInt } from "node:crypto";
import { and, count, eq, inArray } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Database } from "@/db/client";
import {
  answers,
  genres,
  lyricsVersions,
  moods,
  orderStatusHistory,
  orders,
  questionnaireDrafts,
  questions,
  voices,
  type LyricsContent,
} from "@/db/schema";
import type { DraftData } from "@/domain/draft";
import { assertTransition, OPEN_UNPAID_STATUSES, type OrderStatus } from "@/domain/order-status";
import { cleanAnswers, type QuestionDef } from "@/domain/questionnaire";
import { enqueue } from "@/jobs/enqueue";
import { QUEUES } from "@/jobs/queues";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Höchstzahl gleichzeitig offener, unbezahlter Bestellungen pro Konto (Schutz vor Missbrauch). */
export const MAX_OPEN_UNPAID_ORDERS = 3;

export class TooManyOpenOrdersError extends Error {
  constructor() {
    super("Zu viele offene Bestellungen");
    this.name = "TooManyOpenOrdersError";
  }
}

/**
 * Wechselt den Status einer Bestellung – nur entlang der erlaubten Übergänge – und schreibt
 * den Wechsel in die Statushistorie. Die Bestellung wird dabei gesperrt (FOR UPDATE), damit zwei
 * gleichzeitige Wechsel sich nicht in die Quere kommen.
 */
export async function transitionOrder(
  db: Database | Tx,
  orderId: string,
  to: OrderStatus,
  meta: { actor: string; reason?: string; markPaid?: boolean },
): Promise<{ from: OrderStatus; to: OrderStatus }> {
  const run = async (tx: Tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new Error(`Bestellung ${orderId} nicht gefunden`);
    const paidAt = order.paidAt ?? (meta.markPaid ? new Date() : null);
    assertTransition(order.status, to, { paid: paidAt !== null });
    await tx.update(orders).set({ status: to, paidAt, updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({
      orderId,
      fromStatus: order.status,
      toStatus: to,
      reason: meta.reason ?? null,
      actor: meta.actor,
    });
    return { from: order.status, to };
  };
  // Innerhalb einer bestehenden Transaktion wird daraus ein Sicherungspunkt (savepoint)
  return db.transaction(run);
}

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // ohne leicht verwechselbare Zeichen (0/O, 1/I/L)

/** Kurze, gut lesbare Bestellnummer, z. B. "M-7K3P9Q". */
export function newPublicRef(): string {
  let ref = "M-";
  for (let i = 0; i < 6; i++) ref += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return ref;
}

/** Wandelt einen selbst geschriebenen Songtext in Abschnitte um (Leerzeilen trennen Abschnitte). */
export function ownLyricsToContent(text: string): LyricsContent {
  const sections = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0)
    .map((lines) => ({ type: "verse" as const, lines }));
  return { sections };
}

export type CreateOrderInput = {
  userId: string;
  occasionId: string;
  occasionName: string;
  questionnaireVersionId: string;
  questions: QuestionDef[];
  draft: DraftData;
  isTest: boolean;
  /** Entwurf, der beim Anlegen verbraucht (gelöscht) wird. */
  draftCookieId?: string | null;
};

/**
 * Legt aus einem vollständigen Entwurf eine Bestellung an – in EINER Transaktion:
 * Bestellung, Antworten, ggf. eigener Songtext, Statushistorie, Startauftrag für den Worker,
 * Löschen des Entwurfs. Schlägt ein Teil fehl, entsteht nichts.
 */
export async function createOrderFromDraft(db: Database, boss: PgBoss, input: CreateOrderInput) {
  return db.transaction(async (tx) => {
    const [open] = await tx
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.userId, input.userId), inArray(orders.status, [...OPEN_UNPAID_STATUSES])));
    if ((open?.n ?? 0) >= MAX_OPEN_UNPAID_ORDERS) throw new TooManyOpenOrdersError();

    const bySlug = async (table: typeof genres | typeof moods | typeof voices, slug: string | null) => {
      if (!slug) return null;
      const [row] = await tx.select({ id: table.id }).from(table).where(eq(table.slug, slug));
      return row?.id ?? null;
    };
    const { choices } = input.draft;

    let order: typeof orders.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5 && !order; attempt++) {
      [order] = await tx
        .insert(orders)
        .values({
          publicRef: newPublicRef(),
          userId: input.userId,
          occasionId: input.occasionId,
          questionnaireVersionId: input.questionnaireVersionId,
          genreId: await bySlug(genres, choices.genre),
          moodId: await bySlug(moods, choices.mood),
          voiceId: await bySlug(voices, choices.voice),
          songLanguage: choices.songLanguage,
          customLyrics: choices.customLyrics,
          isTest: input.isTest,
        })
        .onConflictDoNothing({ target: orders.publicRef })
        .returning();
    }
    if (!order) throw new Error("Bestellnummer konnte nicht vergeben werden");

    const cleaned = cleanAnswers(input.questions, input.draft.answers);
    const versionQuestions = await tx
      .select({ id: questions.id, key: questions.key })
      .from(questions)
      .where(eq(questions.versionId, input.questionnaireVersionId));
    const rows = Object.entries(cleaned).flatMap(([key, value]) => {
      const q = versionQuestions.find((x) => x.key === key);
      return q ? [{ orderId: order.id, questionId: q.id, value }] : [];
    });
    if (rows.length > 0) await tx.insert(answers).values(rows);

    if (choices.customLyrics) {
      await tx.insert(lyricsVersions).values({
        orderId: order.id,
        version: 1,
        title: `Mein Song – ${input.occasionName}`,
        content: ownLyricsToContent(choices.ownLyrics),
        source: "customer_own",
      });
    }

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "created",
      actor: input.userId,
      reason: "Bestellung aus Fragebogen angelegt",
    });

    await enqueue(boss, QUEUES.orderStart, { orderId: order.id }, { tx, singletonKey: order.id });

    // Entwurf ist verbraucht
    await tx
      .delete(questionnaireDrafts)
      .where(
        and(
          eq(questionnaireDrafts.userId, input.userId),
          eq(questionnaireDrafts.occasionId, input.occasionId),
        ),
      );
    if (input.draftCookieId) {
      await tx.delete(questionnaireDrafts).where(eq(questionnaireDrafts.cookieId, input.draftCookieId));
    }

    return order;
  });
}
