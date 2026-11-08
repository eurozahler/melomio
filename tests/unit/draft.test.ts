import { describe, expect, it } from "vitest";
import { draftDataSchema, emptyDraft, OWN_LYRICS_MAX_LENGTH, validateChoices } from "@/domain/draft";

describe("Entwurf", () => {
  it("ein leerer Entwurf ist gültig", () => {
    expect(draftDataSchema.safeParse(emptyDraft()).success).toBe(true);
  });

  it("lehnt andere Songsprachen ab (erste Version nur Deutsch, E4)", () => {
    const d = emptyDraft();
    expect(draftDataSchema.safeParse({ ...d, choices: { ...d.choices, songLanguage: "en" } }).success).toBe(
      false,
    );
  });

  it("lehnt übergroße Eingaben ab", () => {
    const d = emptyDraft();
    expect(draftDataSchema.safeParse({ ...d, answers: { a: "x".repeat(5001) } }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`k${i}`, "x"]));
    expect(draftDataSchema.safeParse({ ...d, answers: many }).success).toBe(false);
  });
});

describe("Auswahl prüfen", () => {
  const base = { ...emptyDraft().choices, genre: "pop", mood: "froehlich", voice: "maennlich_warm" };

  it("vollständige Auswahl ist gültig", () => {
    expect(validateChoices(base)).toEqual([]);
  });

  it("verlangt Genre, Stimmung und Stimme", () => {
    expect(validateChoices(emptyDraft().choices)).toEqual([
      "genre_required",
      "mood_required",
      "voice_required",
    ]);
  });

  it("eigener Songtext muss ausgefüllt und nicht zu lang sein", () => {
    expect(validateChoices({ ...base, customLyrics: true, ownLyrics: "  " })).toEqual([
      "own_lyrics_required",
    ]);
    expect(
      validateChoices({ ...base, customLyrics: true, ownLyrics: "x".repeat(OWN_LYRICS_MAX_LENGTH + 1) }),
    ).toEqual(["own_lyrics_too_long"]);
    expect(validateChoices({ ...base, customLyrics: true, ownLyrics: "Strophe 1 …" })).toEqual([]);
  });
});
