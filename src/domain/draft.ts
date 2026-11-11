import { z } from "zod";
import { attributionSchema } from "./attribution";

/** Höchstlänge eines selbst geschriebenen Songtexts (E17). */
export const OWN_LYRICS_MAX_LENGTH = 3000;

/**
 * Inhalt eines Fragebogen-Entwurfs, wie ihn der Browser an den Server schickt.
 * Bewusst großzügig: Ein Entwurf darf unvollständig sein. Die vollständige Prüfung
 * (Pflichtfragen, Auswahl) erfolgt, bevor aus dem Entwurf eine Bestellung wird.
 */
export const draftDataSchema = z.object({
  answers: z
    .record(z.string().max(64), z.union([z.string().max(5000), z.array(z.string().max(200)).max(20)]))
    .refine((r) => Object.keys(r).length <= 60, { error: "zu viele Antworten" }),
  choices: z.object({
    genre: z.string().max(64).nullable(),
    mood: z.string().max(64).nullable(),
    voice: z.string().max(64).nullable(),
    songLanguage: z.literal("de"),
    customLyrics: z.boolean(),
    ownLyrics: z.string().max(OWN_LYRICS_MAX_LENGTH),
  }),
  /** Zuletzt geöffneter Schritt, damit es nach dem Neuladen an derselben Stelle weitergeht. */
  step: z.string().max(64).nullable(),
  /** Herkunft des Besuchers beim ersten Speichern (Werbung, Suche …) – wird in die Bestellung übernommen. */
  attribution: attributionSchema.optional(),
});

export type DraftData = z.infer<typeof draftDataSchema>;

export function emptyDraft(): DraftData {
  return {
    answers: {},
    choices: { genre: null, mood: null, voice: null, songLanguage: "de", customLyrics: false, ownLyrics: "" },
    step: null,
  };
}

export type StyleError =
  "genre_required" | "mood_required" | "voice_required" | "own_lyrics_required" | "own_lyrics_too_long";

/** Prüft den Auswahl-Schritt (Genre, Stimmung, Stimme, ggf. eigener Songtext). */
export function validateChoices(choices: DraftData["choices"]): StyleError[] {
  const errors: StyleError[] = [];
  if (!choices.genre) errors.push("genre_required");
  if (!choices.mood) errors.push("mood_required");
  if (!choices.voice) errors.push("voice_required");
  if (choices.customLyrics) {
    const len = choices.ownLyrics.trim().length;
    if (len === 0) errors.push("own_lyrics_required");
    if (len > OWN_LYRICS_MAX_LENGTH) errors.push("own_lyrics_too_long");
  }
  return errors;
}
