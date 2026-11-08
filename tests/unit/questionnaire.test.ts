import { describe, expect, it } from "vitest";
import {
  cleanAnswers,
  isQuestionVisible,
  validateAnswer,
  validateAnswers,
  visibleQuestions,
  type QuestionDef,
} from "@/domain/questionnaire";

function q(partial: Partial<QuestionDef> & Pick<QuestionDef, "key" | "type">): QuestionDef {
  return {
    label: partial.key,
    help: null,
    placeholder: null,
    required: false,
    maxLength: null,
    condition: null,
    options: [],
    ...partial,
  };
}

const JA_NEIN = [
  { value: "ja", label: "Ja" },
  { value: "nein", label: "Nein" },
];

// Nachbau des Geburtstags-Fragebogens
const QUESTIONS: QuestionDef[] = [
  q({ key: "name", type: "text", required: true, maxLength: 10 }),
  q({ key: "round", type: "single_choice", required: true, options: JA_NEIN }),
  q({ key: "age", type: "text", required: true, condition: { questionKey: "round", anyOf: ["ja"] } }),
  // Folgefrage einer Folgefrage
  q({
    key: "party",
    type: "single_choice",
    options: JA_NEIN,
    condition: { questionKey: "age", anyOf: ["50"] },
  }),
  q({ key: "date", type: "date" }),
  q({
    key: "hobbies",
    type: "multi_choice",
    options: [
      { value: "sport", label: "Sport" },
      { value: "musik", label: "Musik" },
    ],
  }),
];

const byKey = (key: string) => QUESTIONS.find((x) => x.key === key)!;

describe("Sichtbarkeit von Folgefragen", () => {
  it("Fragen ohne Bedingung sind immer sichtbar", () => {
    expect(isQuestionVisible(byKey("name"), QUESTIONS, {})).toBe(true);
  });

  it("Folgefrage ist ohne passende Antwort ausgeblendet", () => {
    expect(isQuestionVisible(byKey("age"), QUESTIONS, {})).toBe(false);
    expect(isQuestionVisible(byKey("age"), QUESTIONS, { round: "nein" })).toBe(false);
  });

  it("Folgefrage erscheint bei passender Antwort", () => {
    expect(isQuestionVisible(byKey("age"), QUESTIONS, { round: "ja" })).toBe(true);
  });

  it("verschachtelte Folgefrage verschwindet, wenn die übergeordnete ausgeblendet wird", () => {
    expect(isQuestionVisible(byKey("party"), QUESTIONS, { round: "ja", age: "50" })).toBe(true);
    // „round“ auf nein: age ist ausgeblendet, also auch party – obwohl age noch "50" enthält
    expect(isQuestionVisible(byKey("party"), QUESTIONS, { round: "nein", age: "50" })).toBe(false);
  });

  it("Bedingungen funktionieren auch mit Mehrfachauswahl", () => {
    const questions = [
      byKey("hobbies"),
      q({ key: "instrument", type: "text", condition: { questionKey: "hobbies", anyOf: ["musik"] } }),
    ];
    expect(isQuestionVisible(questions[1]!, questions, { hobbies: ["sport"] })).toBe(false);
    expect(isQuestionVisible(questions[1]!, questions, { hobbies: ["sport", "musik"] })).toBe(true);
  });

  it("Kreisbezüge führen nicht zu einer Endlosschleife", () => {
    const a = q({ key: "a", type: "text", condition: { questionKey: "b", anyOf: ["x"] } });
    const b = q({ key: "b", type: "text", condition: { questionKey: "a", anyOf: ["x"] } });
    expect(isQuestionVisible(a, [a, b], { a: "x", b: "x" })).toBe(false);
  });

  it("visibleQuestions behält die Reihenfolge bei", () => {
    expect(visibleQuestions(QUESTIONS, { round: "ja" }).map((x) => x.key)).toEqual([
      "name",
      "round",
      "age",
      "date",
      "hobbies",
    ]);
  });
});

describe("Antworten bereinigen", () => {
  it("entfernt Antworten auf ausgeblendete, unbekannte und leere Fragen", () => {
    const cleaned = cleanAnswers(QUESTIONS, {
      name: "  Anna  ",
      round: "nein",
      age: "50", // ausgeblendet, weil round = nein
      unbekannt: "x",
      date: "",
    });
    expect(cleaned).toEqual({ name: "Anna", round: "nein" });
  });
});

describe("Antworten prüfen", () => {
  it("Pflichtfrage ohne Antwort ist ein Fehler", () => {
    expect(validateAnswer(byKey("name"), undefined)).toBe("required");
    expect(validateAnswer(byKey("name"), "   ")).toBe("required");
  });

  it("freiwillige Frage ohne Antwort ist in Ordnung", () => {
    expect(validateAnswer(byKey("date"), undefined)).toBeNull();
  });

  it("zu lange Texte werden abgelehnt", () => {
    expect(validateAnswer(byKey("name"), "12345678901")).toBe("too_long");
    expect(validateAnswer(byKey("name"), "1234567890")).toBeNull();
  });

  it("nur erlaubte Auswahlwerte werden akzeptiert", () => {
    expect(validateAnswer(byKey("round"), "vielleicht")).toBe("invalid_option");
    expect(validateAnswer(byKey("hobbies"), ["sport", "hacken"])).toBe("invalid_option");
    expect(validateAnswer(byKey("hobbies"), ["sport"])).toBeNull();
  });

  it("Datum muss gültig sein", () => {
    expect(validateAnswer(byKey("date"), "2026-12-24")).toBeNull();
    expect(validateAnswer(byKey("date"), "24.12.2026")).toBe("invalid_date");
  });

  it("falscher Typ wird abgelehnt", () => {
    expect(validateAnswer(byKey("name"), ["Anna"])).toBe("invalid_type");
    expect(validateAnswer(byKey("hobbies"), "sport")).toBe("invalid_type");
  });

  it("ausgeblendete Pflichtfragen werden nicht verlangt", () => {
    expect(validateAnswers(QUESTIONS, { name: "Anna", round: "nein" })).toEqual({});
    expect(validateAnswers(QUESTIONS, { name: "Anna", round: "ja" })).toEqual({ age: "required" });
  });
});
