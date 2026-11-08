import { z } from "zod";

/**
 * Austauschbare Schnittstelle für Songtexte (docs/ARCHITEKTUR.md, Abschnitt 3).
 * Der restliche Code kennt nur diese Schnittstelle, nicht den konkreten Anbieter.
 */

export const SECTION_TYPES = ["intro", "verse", "chorus", "bridge", "outro"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/** Grenzen für einen Songtext (ca. 3 Minuten, E4). Gelten für KI-Texte und Kundenbearbeitungen. */
export const LYRICS_LIMITS = {
  titleMax: 80,
  sectionsMax: 12,
  linesPerSectionMax: 16,
  lineMax: 120,
} as const;

export const lyricsSchema = z.object({
  title: z.string().trim().min(1).max(LYRICS_LIMITS.titleMax),
  sections: z
    .array(
      z.object({
        type: z.enum(SECTION_TYPES),
        lines: z
          .array(z.string().trim().min(1).max(LYRICS_LIMITS.lineMax))
          .min(1)
          .max(LYRICS_LIMITS.linesPerSectionMax),
      }),
    )
    .min(1)
    .max(LYRICS_LIMITS.sectionsMax),
});

export type Lyrics = z.infer<typeof lyricsSchema>;

/** Was der Anbieter über die Bestellung erfährt – nur das Nötige, keine E-Mail-Adresse (Datenminimierung). */
export type LyricsInput = {
  occasion: string;
  /** Frage → Antwort, in der Reihenfolge des Fragebogens. */
  answers: Array<{ question: string; answer: string }>;
  /** Name der Person, für die der Song ist (falls aus den Antworten ermittelbar). */
  recipientName: string | null;
  genre: { name: string; hint: string } | null;
  mood: { name: string; hint: string } | null;
  voice: { name: string; hint: string } | null;
  language: "de";
};

export type LyricsRevision = { previous: Lyrics; feedback: string | null };

export type LyricsResult = Lyrics & {
  /** Anbieter- und Modellangabe für die Nachvollziehbarkeit. */
  model: string;
};

export interface LyricsProvider {
  readonly name: string;
  generate(input: LyricsInput, systemPrompt: string, model: string): Promise<LyricsResult>;
  revise(
    input: LyricsInput,
    revision: LyricsRevision,
    systemPrompt: string,
    model: string,
  ): Promise<LyricsResult>;
}

/** Der Anbieter hat die Anfrage abgelehnt (z. B. Sicherheitsfilter) – nicht sinnvoll wiederholbar. */
export class LyricsRefusedError extends Error {
  constructor(detail: string) {
    super(`Songtext abgelehnt: ${detail}`);
    this.name = "LyricsRefusedError";
  }
}
