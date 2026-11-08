/**
 * Fragebogen-Logik ohne Framework: Sichtbarkeit von Folgefragen und Prüfung der Antworten.
 * Wird im Browser (Anzeige) und auf dem Server (Prüfung) gleich verwendet.
 */

export type QuestionType = "text" | "textarea" | "single_choice" | "multi_choice" | "date";

export type QuestionDef = {
  key: string;
  type: QuestionType;
  label: string;
  help: string | null;
  placeholder: string | null;
  required: boolean;
  maxLength: number | null;
  condition: { questionKey: string; anyOf: string[] } | null;
  options: Array<{ value: string; label: string }>;
};

export type AnswerValue = string | string[];
export type Answers = Record<string, AnswerValue>;

/** Obergrenze, falls eine Frage keine eigene hat. */
export const DEFAULT_MAX_LENGTH = { text: 200, textarea: 2000 } as const;

function asArray(value: AnswerValue | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return value.trim().length > 0;
}

/**
 * Eine Frage ist sichtbar, wenn sie keine Bedingung hat oder wenn die Bezugsfrage
 * selbst sichtbar ist und einen der geforderten Werte enthält.
 */
export function isQuestionVisible(
  question: QuestionDef,
  questions: QuestionDef[],
  answers: Answers,
): boolean {
  const seen = new Set<string>();
  let current: QuestionDef | undefined = question;
  while (current?.condition) {
    if (seen.has(current.key)) return false; // Kreisbezug: sicherheitshalber ausblenden
    seen.add(current.key);
    const condition: NonNullable<QuestionDef["condition"]> = current.condition;
    const given = asArray(answers[condition.questionKey]);
    if (!given.some((v) => condition.anyOf.includes(v))) return false;
    current = questions.find((q) => q.key === condition.questionKey);
  }
  return true;
}

export function visibleQuestions(questions: QuestionDef[], answers: Answers): QuestionDef[] {
  return questions.filter((q) => isQuestionVisible(q, questions, answers));
}

/** Entfernt Antworten auf unbekannte oder ausgeblendete Fragen sowie leere Antworten. */
export function cleanAnswers(questions: QuestionDef[], answers: Answers): Answers {
  const visible = new Set(visibleQuestions(questions, answers).map((q) => q.key));
  const result: Answers = {};
  for (const [key, value] of Object.entries(answers)) {
    if (visible.has(key) && isAnswered(value)) {
      result[key] = Array.isArray(value) ? value : value.trim();
    }
  }
  return result;
}

export type AnswerError = "required" | "too_long" | "invalid_option" | "invalid_date" | "invalid_type";

/** Prüft eine einzelne Antwort. Gibt null zurück, wenn sie in Ordnung ist. */
export function validateAnswer(question: QuestionDef, value: AnswerValue | undefined): AnswerError | null {
  if (!isAnswered(value)) return question.required ? "required" : null;

  switch (question.type) {
    case "text":
    case "textarea": {
      if (typeof value !== "string") return "invalid_type";
      const max = question.maxLength ?? DEFAULT_MAX_LENGTH[question.type];
      return value.trim().length > max ? "too_long" : null;
    }
    case "date": {
      if (typeof value !== "string") return "invalid_type";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return "invalid_date";
      return null;
    }
    case "single_choice": {
      if (typeof value !== "string") return "invalid_type";
      return question.options.some((o) => o.value === value) ? null : "invalid_option";
    }
    case "multi_choice": {
      if (!Array.isArray(value)) return "invalid_type";
      const allowed = new Set(question.options.map((o) => o.value));
      return value.every((v) => allowed.has(v)) ? null : "invalid_option";
    }
  }
}

/** Prüft alle sichtbaren Fragen. Ergebnis: Frage-Schlüssel → Fehler (leer = alles in Ordnung). */
export function validateAnswers(questions: QuestionDef[], answers: Answers): Record<string, AnswerError> {
  const errors: Record<string, AnswerError> = {};
  for (const q of visibleQuestions(questions, answers)) {
    const error = validateAnswer(q, answers[q.key]);
    if (error) errors[q.key] = error;
  }
  return errors;
}
