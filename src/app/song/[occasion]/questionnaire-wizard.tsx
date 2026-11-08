"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { validateChoices, type DraftData, type StyleError, OWN_LYRICS_MAX_LENGTH } from "@/domain/draft";
import {
  DEFAULT_MAX_LENGTH,
  validateAnswer,
  visibleQuestions,
  type AnswerError,
  type AnswerValue,
  type QuestionDef,
} from "@/domain/questionnaire";
import type { ChoiceLists } from "@/server/catalog";
import { saveDraftAction } from "./actions";

type Props = {
  occasionSlug: string;
  occasionName: string;
  questions: QuestionDef[];
  choiceLists: ChoiceLists;
  initialDraft: DraftData;
};

type SaveState = "idle" | "saving" | "saved" | "failed";

const STYLE_STEP = "__style";
const SUMMARY_STEP = "__summary";
const SAVE_DELAY_MS = 700;

export function QuestionnaireWizard({
  occasionSlug,
  occasionName,
  questions,
  choiceLists,
  initialDraft,
}: Props) {
  const t = useTranslations("Wizard");
  const tc = useTranslations("Common");
  const [draft, setDraft] = useState<DraftData>(initialDraft);
  const [showErrors, setShowErrors] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Schritte: alle sichtbaren Fragen, dann Auswahl (Genre usw.), dann Zusammenfassung
  const visible = useMemo(() => visibleQuestions(questions, draft.answers), [questions, draft.answers]);
  const steps = useMemo(() => [...visible.map((q) => q.key), STYLE_STEP, SUMMARY_STEP], [visible]);
  const currentKey = draft.step && steps.includes(draft.step) ? draft.step : steps[0]!;
  const currentIndex = steps.indexOf(currentKey);
  const currentQuestion = visible.find((q) => q.key === currentKey);

  // --- Automatisch speichern (verzögert, damit nicht bei jedem Tastendruck gespeichert wird)
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("saving");
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await saveDraftAction(occasionSlug, draft);
        if (!cancelled) setSaveState(result.ok ? "saved" : "failed");
      } catch {
        if (!cancelled) setSaveState("failed");
      }
    }, SAVE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, occasionSlug]);

  // Beim Schrittwechsel die Überschrift fokussieren (Bildschirmleser, Tastatur)
  const lastStep = useRef(currentKey);
  useEffect(() => {
    if (lastStep.current !== currentKey) {
      lastStep.current = currentKey;
      headingRef.current?.focus();
      window.scrollTo({ top: 0 });
    }
  }, [currentKey]);

  const setAnswer = (key: string, value: AnswerValue) =>
    setDraft((d) => ({ ...d, answers: { ...d.answers, [key]: value } }));
  const setChoices = (patch: Partial<DraftData["choices"]>) =>
    setDraft((d) => ({ ...d, choices: { ...d.choices, ...patch } }));
  const goTo = (key: string) => {
    setShowErrors(false);
    setDraft((d) => ({ ...d, step: key }));
  };

  const questionError: AnswerError | null = currentQuestion
    ? validateAnswer(currentQuestion, draft.answers[currentQuestion.key])
    : null;
  const styleErrors: StyleError[] = currentKey === STYLE_STEP ? validateChoices(draft.choices) : [];
  const stepValid = currentQuestion ? questionError === null : styleErrors.length === 0;

  const next = () => {
    if (!stepValid) {
      setShowErrors(true);
      return;
    }
    const nextKey = steps[currentIndex + 1];
    if (nextKey) goTo(nextKey);
  };
  // Vor dem Wechsel zur Anmeldung sicher speichern, dann weiter (Anmeldung, Zuordnung zum Konto)
  const [continuing, setContinuing] = useState(false);
  const continueToAccount = async () => {
    setContinuing(true);
    try {
      const result = await saveDraftAction(occasionSlug, draft);
      if (!result.ok) throw new Error(result.error);
      // Volle Seitennavigation nötig: /weiter ist ein Route Handler mit Weiterleitungen, keine Seite
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/song/${occasionSlug}/weiter`);
    } catch {
      setSaveState("failed");
      setContinuing(false);
    }
  };

  const back = () => {
    const prevKey = steps[currentIndex - 1];
    if (prevKey) goTo(prevKey);
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-6 pb-28">
      {/* Kopf: Anlass, Fortschritt, Speicherstatus */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-neutral-500">
          <span className="font-semibold text-brand">{occasionName}</span>
          <span aria-live="polite" data-testid="save-state">
            {saveState === "saving" && t("saving")}
            {saveState === "saved" && `✓ ${t("saved")}`}
            {saveState === "failed" && <span className="text-red-600">{t("saveFailed")}</span>}
          </span>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={currentIndex + 1}
          aria-label={t("stepOf", { current: currentIndex + 1, total: steps.length })}
        >
          <div
            className="bg-brand-gradient h-full rounded-full transition-all"
            style={{ width: `${((currentIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          {t("stepOf", { current: currentIndex + 1, total: steps.length })}
        </p>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        className="flex flex-1 flex-col"
      >
        {currentQuestion && (
          <QuestionStep
            key={currentQuestion.key}
            question={currentQuestion}
            value={draft.answers[currentQuestion.key]}
            error={showErrors ? questionError : null}
            onChange={(v) => setAnswer(currentQuestion.key, v)}
            headingRef={headingRef}
          />
        )}
        {currentKey === STYLE_STEP && (
          <StyleStep
            choices={draft.choices}
            lists={choiceLists}
            errors={showErrors ? styleErrors : []}
            onChange={setChoices}
            headingRef={headingRef}
          />
        )}
        {currentKey === SUMMARY_STEP && (
          <SummaryStep
            draft={draft}
            questions={visible}
            lists={choiceLists}
            onEdit={goTo}
            headingRef={headingRef}
          />
        )}

        {/* Navigation fest am unteren Rand – gut mit dem Daumen erreichbar */}
        <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
          <div className="mx-auto flex max-w-xl gap-3">
            <button
              type="button"
              onClick={back}
              disabled={currentIndex === 0}
              className="rounded-full border border-neutral-300 px-5 py-3 font-semibold disabled:opacity-40 dark:border-neutral-700"
            >
              {tc("back")}
            </button>
            {currentKey !== SUMMARY_STEP ? (
              <button
                type="submit"
                className="flex-1 rounded-full bg-brand-strong px-5 py-3 font-semibold text-white hover:bg-brand-strong-hover"
              >
                {tc("next")}
              </button>
            ) : (
              <button
                type="button"
                onClick={continueToAccount}
                disabled={continuing}
                className="flex-1 rounded-full bg-brand-strong px-5 py-3 font-semibold text-white hover:bg-brand-strong-hover disabled:opacity-60"
              >
                {t("summary.continue")}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------

type HeadingRef = React.RefObject<HTMLHeadingElement | null>;

function StepHeading({
  headingRef,
  children,
  id,
}: {
  headingRef: HeadingRef;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <h1 ref={headingRef} id={id} tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none">
      {children}
    </h1>
  );
}

function ErrorText({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-2 text-sm font-medium text-red-600">
      {children}
    </p>
  );
}

const inputClass =
  "w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base shadow-sm focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900";

function QuestionStep({
  question,
  value,
  error,
  onChange,
  headingRef,
}: {
  question: QuestionDef;
  value: AnswerValue | undefined;
  error: AnswerError | null;
  onChange: (v: AnswerValue) => void;
  headingRef: HeadingRef;
}) {
  const t = useTranslations("Wizard");
  const fieldId = `q-${question.key}`;
  const errorId = `${fieldId}-error`;
  const helpId = `${fieldId}-help`;
  const describedBy =
    [question.help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const text = typeof value === "string" ? value : "";

  const isChoice = question.type === "single_choice" || question.type === "multi_choice";

  return (
    <div className="flex flex-col gap-4">
      {isChoice ? (
        <StepHeading headingRef={headingRef} id={`${fieldId}-label`}>
          {question.label}
        </StepHeading>
      ) : (
        <StepHeading headingRef={headingRef}>
          <label htmlFor={fieldId}>{question.label}</label>
        </StepHeading>
      )}
      {!question.required && <p className="-mt-3 text-sm text-neutral-500">({t("optional")})</p>}
      {question.help && (
        <p id={helpId} className="text-neutral-600 dark:text-neutral-300">
          {question.help}
        </p>
      )}

      {question.type === "text" && (
        <input
          id={fieldId}
          type="text"
          className={inputClass}
          value={text}
          placeholder={question.placeholder ?? undefined}
          maxLength={question.maxLength ?? DEFAULT_MAX_LENGTH.text}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      )}

      {question.type === "textarea" && (
        <>
          <textarea
            id={fieldId}
            rows={6}
            className={inputClass}
            value={text}
            placeholder={question.placeholder ?? undefined}
            maxLength={question.maxLength ?? DEFAULT_MAX_LENGTH.textarea}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="flex justify-between text-xs text-neutral-500">
            <span>🎤 {t("dictationHint")}</span>
            <span>
              {t("charCount", { count: text.length, max: question.maxLength ?? DEFAULT_MAX_LENGTH.textarea })}
            </span>
          </div>
        </>
      )}

      {question.type === "date" && (
        <input
          id={fieldId}
          type="date"
          className={inputClass}
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {isChoice && (
        <div
          role={question.type === "single_choice" ? "radiogroup" : "group"}
          aria-labelledby={`${fieldId}-label`}
          aria-describedby={describedBy}
          className="flex flex-col gap-3"
        >
          {question.options.map((option) => {
            const selected = Array.isArray(value) ? value.includes(option.value) : value === option.value;
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-4 text-base transition ${
                  selected
                    ? "border-brand bg-brand/10 font-semibold dark:bg-brand/15"
                    : "border-neutral-300 hover:border-brand/50 dark:border-neutral-700"
                }`}
              >
                <input
                  type={question.type === "single_choice" ? "radio" : "checkbox"}
                  name={fieldId}
                  value={option.value}
                  checked={selected}
                  className="h-5 w-5 accent-brand-strong"
                  onChange={(e) => {
                    if (question.type === "single_choice") return onChange(option.value);
                    const current = Array.isArray(value) ? value : [];
                    onChange(
                      e.target.checked
                        ? [...current, option.value]
                        : current.filter((v) => v !== option.value),
                    );
                  }}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      )}

      {error && <ErrorText id={errorId}>{t(`errors.${error}`)}</ErrorText>}
    </div>
  );
}

function ChoiceGroup({
  name,
  legend,
  items,
  value,
  error,
  note,
  onChange,
}: {
  name: string;
  legend: string;
  items: { slug: string; name: string }[];
  value: string | null;
  error: string | null;
  note?: string;
  onChange: (slug: string) => void;
}) {
  const errorId = `${name}-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2 text-lg font-semibold">{legend}</legend>
      {note && <p className="mb-2 text-sm text-neutral-500">{note}</p>}
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const selected = value === item.slug;
          return (
            <label
              key={item.slug}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-3 text-sm transition ${
                selected
                  ? "border-brand bg-brand/10 font-semibold dark:bg-brand/15"
                  : "border-neutral-300 hover:border-brand/50 dark:border-neutral-700"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={item.slug}
                checked={selected}
                className="h-4 w-4 accent-brand-strong"
                onChange={() => onChange(item.slug)}
              />
              {item.name}
            </label>
          );
        })}
      </div>
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </fieldset>
  );
}

function StyleStep({
  choices,
  lists,
  errors,
  onChange,
  headingRef,
}: {
  choices: DraftData["choices"];
  lists: ChoiceLists;
  errors: StyleError[];
  onChange: (patch: Partial<DraftData["choices"]>) => void;
  headingRef: HeadingRef;
}) {
  const t = useTranslations("Wizard");
  const err = (code: StyleError) => (errors.includes(code) ? t(`errors.${code}`) : null);
  return (
    <div className="flex flex-col gap-7">
      <StepHeading headingRef={headingRef}>{t("style.title")}</StepHeading>
      <ChoiceGroup
        name="genre"
        legend={t("style.genre")}
        items={lists.genres}
        value={choices.genre}
        error={err("genre_required")}
        onChange={(genre) => onChange({ genre })}
      />
      <ChoiceGroup
        name="mood"
        legend={t("style.mood")}
        items={lists.moods}
        value={choices.mood}
        error={err("mood_required")}
        onChange={(mood) => onChange({ mood })}
      />
      <ChoiceGroup
        name="voice"
        legend={t("style.voice")}
        items={lists.voices}
        value={choices.voice}
        error={err("voice_required")}
        note={t("style.voiceNote")}
        onChange={(voice) => onChange({ voice })}
      />
      <div>
        <p className="text-lg font-semibold">{t("style.language")}</p>
        <p>
          {t("style.languageDe")}{" "}
          <span className="text-sm text-neutral-500">· {t("style.languageNote")}</span>
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={choices.customLyrics}
            className="h-5 w-5 accent-brand-strong"
            onChange={(e) => onChange({ customLyrics: e.target.checked })}
          />
          <span className="font-medium">{t("style.customLyrics")}</span>
        </label>
        {choices.customLyrics && (
          <div>
            <label htmlFor="own-lyrics" className="mb-1 block font-semibold">
              {t("style.ownLyricsLabel")}
            </label>
            <p id="own-lyrics-help" className="mb-2 text-sm text-neutral-500">
              {t("style.ownLyricsHelp")}
            </p>
            <textarea
              id="own-lyrics"
              rows={10}
              className={inputClass}
              value={choices.ownLyrics}
              maxLength={OWN_LYRICS_MAX_LENGTH}
              aria-describedby="own-lyrics-help"
              onChange={(e) => onChange({ ownLyrics: e.target.value })}
            />
            {(err("own_lyrics_required") || err("own_lyrics_too_long")) && (
              <ErrorText id="own-lyrics-error">
                {err("own_lyrics_required") ?? err("own_lyrics_too_long")}
              </ErrorText>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStep({
  draft,
  questions,
  lists,
  onEdit,
  headingRef,
}: {
  draft: DraftData;
  questions: QuestionDef[];
  lists: ChoiceLists;
  onEdit: (step: string) => void;
  headingRef: HeadingRef;
}) {
  const t = useTranslations("Wizard");
  const display = (q: QuestionDef): string => {
    const v = draft.answers[q.key];
    if (v === undefined || (Array.isArray(v) ? v.length === 0 : v.trim() === ""))
      return t("summary.noAnswer");
    const values = Array.isArray(v) ? v : [v];
    if (q.type === "date") return new Date(`${values[0]}T00:00:00`).toLocaleDateString("de-DE");
    return values.map((x) => q.options.find((o) => o.value === x)?.label ?? x).join(", ");
  };
  const nameOf = (list: { slug: string; name: string }[], slug: string | null) =>
    list.find((i) => i.slug === slug)?.name ?? t("summary.noAnswer");

  return (
    <div className="flex flex-col gap-5">
      <StepHeading headingRef={headingRef}>{t("summary.title")}</StepHeading>
      <p className="text-neutral-600 dark:text-neutral-300">{t("summary.intro")}</p>
      <dl className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {questions.map((q) => (
          <div key={q.key} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <dt className="text-sm text-neutral-500">{q.label}</dt>
              <dd className="break-words whitespace-pre-line">{display(q)}</dd>
            </div>
            <button
              type="button"
              onClick={() => onEdit(q.key)}
              className="shrink-0 text-sm font-semibold text-brand"
            >
              {t("summary.edit")}
            </button>
          </div>
        ))}
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div>
            <dt className="text-sm text-neutral-500">
              {t("style.genre")} · {t("style.mood")} · {t("style.voice")}
            </dt>
            <dd>
              {nameOf(lists.genres, draft.choices.genre)} · {nameOf(lists.moods, draft.choices.mood)} ·{" "}
              {nameOf(lists.voices, draft.choices.voice)}
              {draft.choices.customLyrics && ` · ${t("summary.ownLyricsYes")}`}
            </dd>
          </div>
          <button
            type="button"
            onClick={() => onEdit(STYLE_STEP)}
            className="shrink-0 text-sm font-semibold text-brand"
          >
            {t("summary.edit")}
          </button>
        </div>
      </dl>
    </div>
  );
}
