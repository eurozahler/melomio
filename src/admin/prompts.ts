import { and, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { auditLogs, promptVersions } from "@/db/schema";
import { LYRICS_SYSTEM_PROMPT_KEY } from "@/lyrics/prompts";
import type { LyricsInput, LyricsProvider, LyricsResult } from "@/lyrics/types";

/**
 * Prompt-Verwaltung (C6): Fassungen des System-Prompts für die Songtexte. Jede Änderung ist eine
 * neue Fassung; genau eine ist aktiv. „Zurück zu Fassung X“ = alte Fassung wieder aktivieren.
 * Jeder Songtext speichert, mit welcher Fassung er entstanden ist (lyrics_versions.prompt_version_id).
 */

export const LYRICS_MODELS = [
  { value: "claude-opus-5-5", label: "Claude Opus 5.5 (Standard, beste Qualität)" },
  { value: "claude-fable-5-1", label: "Claude Fable 5.1" },
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (günstiger, schneller)" },
  { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 (am günstigsten)" },
] as const;

export class PromptError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join("; "));
    this.name = "PromptError";
  }
}

export async function listPromptVersions(db: Database) {
  return db
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.key, LYRICS_SYSTEM_PROMPT_KEY))
    .orderBy(desc(promptVersions.version));
}

const promptSchema = z.object({
  template: z
    .string()
    .trim()
    .min(200, { error: "Der Prompt ist zu kurz (mindestens 200 Zeichen)" })
    .max(20_000, { error: "Der Prompt ist zu lang (höchstens 20.000 Zeichen)" }),
  model: z.enum(LYRICS_MODELS.map((m) => m.value) as [string, ...string[]], { error: "Unbekanntes Modell" }),
});

/** Neue Fassung speichern (noch nicht aktiv). */
export async function savePromptVersion(db: Database, input: unknown, actorUserId: string) {
  const parsed = promptSchema.safeParse(input);
  if (!parsed.success) throw new PromptError(parsed.error.issues.map((i) => i.message));
  return db.transaction(async (tx) => {
    const [{ v } = { v: 0 }] = await tx
      .select({ v: max(promptVersions.version) })
      .from(promptVersions)
      .where(eq(promptVersions.key, LYRICS_SYSTEM_PROMPT_KEY));
    const [row] = await tx
      .insert(promptVersions)
      .values({
        key: LYRICS_SYSTEM_PROMPT_KEY,
        version: (v ?? 0) + 1,
        template: parsed.data.template,
        model: parsed.data.model,
        active: false,
        createdBy: actorUserId,
      })
      .returning();
    await tx.insert(auditLogs).values({
      actorUserId,
      action: "prompt.create",
      entity: "prompt_version",
      entityId: row!.id,
      newValue: { version: row!.version, model: row!.model },
    });
    return row!;
  });
}

/** Fassung aktivieren – gilt ab sofort für neue Songtexte. */
export async function activatePromptVersion(db: Database, id: string, actorUserId: string) {
  await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(promptVersions)
      .where(and(eq(promptVersions.id, id), eq(promptVersions.key, LYRICS_SYSTEM_PROMPT_KEY)));
    if (!target) throw new PromptError(["Fassung nicht gefunden"]);
    await tx
      .update(promptVersions)
      .set({ active: false })
      .where(eq(promptVersions.key, LYRICS_SYSTEM_PROMPT_KEY));
    await tx.update(promptVersions).set({ active: true }).where(eq(promptVersions.id, id));
    await tx.insert(auditLogs).values({
      actorUserId,
      action: "prompt.activate",
      entity: "prompt_version",
      entityId: id,
      newValue: { version: target.version },
    });
  });
}

/** Beispielbestellung für Testläufe (keine echten Kundendaten). */
export const SAMPLE_INPUT: LyricsInput = {
  occasion: "Geburtstag",
  answers: [
    { question: "Wie heißt die Person, für die der Song ist?", answer: "Anna" },
    { question: "Wie alt wird sie?", answer: "30" },
    {
      question: "Was macht sie besonders?",
      answer:
        "Sie lacht über ihre eigenen Witze, bevor sie die Pointe erzählt, und backt jeden Sonntag Zimtschnecken.",
    },
    {
      question: "Ein gemeinsames Erlebnis?",
      answer: "Die Fahrt ans Meer mit dem alten Bus, als Jürgen die Karte falsch herum gehalten hat.",
    },
  ],
  recipientName: "Anna",
  genre: { name: "Pop", hint: "modern German pop, catchy chorus, polished production" },
  mood: { name: "Fröhlich", hint: "joyful, upbeat, celebratory" },
  voice: { name: "Sanfte Frauenstimme", hint: "soft female vocals" },
  language: "de",
};

/** Testlauf mit der Beispielbestellung. Beim echten Anbieter kostenpflichtig (wenige Cent). */
export async function testPrompt(provider: LyricsProvider, input: unknown): Promise<LyricsResult> {
  const parsed = promptSchema.safeParse(input);
  if (!parsed.success) throw new PromptError(parsed.error.issues.map((i) => i.message));
  return provider.generate(SAMPLE_INPUT, parsed.data.template, parsed.data.model);
}
