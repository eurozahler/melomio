import { and, asc, desc, eq } from "drizzle-orm";
import type { AppEnv } from "@/config/env";
import type { Database } from "@/db/client";
import {
  answers,
  genres,
  moods,
  occasions,
  orders,
  promptVersions,
  questionOptions,
  questions,
  voices,
} from "@/db/schema";
import { createAnthropicLyricsProvider } from "./anthropic";
import { filterInput } from "./filter";
import { mockLyricsProvider } from "./mock";
import { LYRICS_DEFAULT_MODEL, LYRICS_SYSTEM_PROMPT_KEY, LYRICS_SYSTEM_PROMPT_V1 } from "./prompts";
import type { LyricsInput, LyricsProvider } from "./types";

export * from "./types";

/** Wählt den Songtext-Baustein laut Konfiguration (LYRICS_PROVIDER). */
export function getLyricsProvider(
  env: Pick<AppEnv, "LYRICS_PROVIDER" | "ANTHROPIC_API_KEY">,
): LyricsProvider {
  if (env.LYRICS_PROVIDER === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY fehlt");
    return createAnthropicLyricsProvider(env.ANTHROPIC_API_KEY);
  }
  return mockLyricsProvider;
}

/** Aktive Fassung des System-Prompts (Fallback: eingebaute Version 1). */
export async function getActiveSystemPrompt(db: Database) {
  const [row] = await db
    .select()
    .from(promptVersions)
    .where(and(eq(promptVersions.key, LYRICS_SYSTEM_PROMPT_KEY), eq(promptVersions.active, true)))
    .orderBy(desc(promptVersions.version))
    .limit(1);
  return row
    ? { id: row.id as string | null, template: row.template, model: row.model }
    : { id: null, template: LYRICS_SYSTEM_PROMPT_V1, model: LYRICS_DEFAULT_MODEL };
}

/** Schlüssel der Fragen, deren Antwort der Name der beschenkten Person ist. */
const RECIPIENT_KEYS = ["recipient_name", "partner_name", "couple_names"];

/**
 * Stellt aus der Bestellung die Eingabe für den Songtext zusammen – nur Anlass, Antworten und
 * Stilangaben, keine Kontaktdaten. Kundeneingaben laufen durch den Filter (Künstlernamen usw.).
 */
export async function buildLyricsInput(
  db: Database,
  orderId: string,
): Promise<{ input: LyricsInput; flagged: boolean }> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  const [occasion] = await db.select().from(occasions).where(eq(occasions.id, order.occasionId));

  const rows = await db
    .select({
      questionId: questions.id,
      key: questions.key,
      type: questions.type,
      label: questions.label,
      value: answers.value,
    })
    .from(answers)
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .where(eq(answers.orderId, orderId))
    .orderBy(asc(questions.sort));
  const options = await db.select().from(questionOptions);

  let flagged = false;
  const list = rows.map((r) => {
    const values = Array.isArray(r.value) ? r.value : [r.value];
    const readable =
      r.type === "single_choice" || r.type === "multi_choice"
        ? values
            .map((v) => options.find((o) => o.questionId === r.questionId && o.value === v)?.label.de ?? v)
            .join(", ")
        : values.join(", ");
    const filtered = filterInput(readable);
    flagged ||= filtered.flagged;
    return { key: r.key, question: r.label.de, answer: filtered.text };
  });

  const choice = async (table: typeof genres | typeof moods | typeof voices, id: string | null) => {
    if (!id) return null;
    const [row] = await db.select().from(table).where(eq(table.id, id));
    return row ? { name: row.name.de, hint: row.promptHint } : null;
  };

  const recipient = list.find((a) => RECIPIENT_KEYS.includes(a.key))?.answer ?? null;
  return {
    flagged,
    input: {
      occasion: occasion?.name.de ?? "Besonderer Anlass",
      answers: list.map(({ question, answer }) => ({ question, answer })),
      recipientName: recipient,
      genre: await choice(genres, order.genreId),
      mood: await choice(moods, order.moodId),
      voice: await choice(voices, order.voiceId),
      language: "de",
    },
  };
}
