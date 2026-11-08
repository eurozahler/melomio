"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Notice } from "@/components/auth-ui";
import { LYRICS_LIMITS, type Lyrics, type SectionType } from "@/lyrics/types";
import {
  approveLyricsAction,
  requestRevisionAction,
  saveLyricsEditAction,
  type LyricsActionResult,
} from "./actions";

type Mode = "view" | "edit" | "revise" | "approve";

/** Abschnittsnamen: Strophen werden durchnummeriert, alle anderen heißen wie ihr Typ. */
function useSectionLabels(sections: Lyrics["sections"]) {
  const t = useTranslations("Lyrics.sections");
  let verse = 0;
  return sections.map((s) =>
    s.type === "verse" ? t("verse", { n: ++verse }) : t(s.type as Exclude<SectionType, "verse">),
  );
}

export function LyricsView({ lyrics }: { lyrics: Lyrics }) {
  const labels = useSectionLabels(lyrics.sections);
  return (
    <article
      className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800"
      data-testid="lyrics"
    >
      <h2 className="text-2xl font-bold" data-testid="lyrics-title">
        {lyrics.title}
      </h2>
      {lyrics.sections.map((section, i) => (
        <section key={i} className="mt-5">
          <h3 className="text-xs font-semibold tracking-wider text-brand uppercase">{labels[i]}</h3>
          <p
            className={`mt-1 leading-relaxed whitespace-pre-line ${section.type === "chorus" ? "font-medium" : ""}`}
          >
            {section.lines.join("\n")}
          </p>
        </section>
      ))}
    </article>
  );
}

const fieldClass =
  "w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base shadow-sm focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900";
const primary =
  "rounded-full bg-brand-strong px-5 py-3 font-semibold text-white hover:bg-brand-strong-hover disabled:opacity-60";
const secondary =
  "rounded-full border border-neutral-300 px-5 py-3 font-semibold disabled:opacity-50 dark:border-neutral-700";

export function LyricsReview({
  publicRef,
  lyrics,
  revisionsLeft,
}: {
  publicRef: string;
  lyrics: Lyrics;
  revisionsLeft: number;
}) {
  const t = useTranslations("Lyrics");
  const id = useId();
  const [mode, setMode] = useState<Mode>("view");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const labels = useSectionLabels(lyrics.sections);

  // Bearbeitungsstand
  const [title, setTitle] = useState(lyrics.title);
  const [texts, setTexts] = useState(lyrics.sections.map((s) => s.lines.join("\n")));
  const [feedback, setFeedback] = useState("");

  const handle = (result: LyricsActionResult, after?: () => void) => {
    if (result.ok) {
      setError(null);
      after?.();
    } else {
      setError(t(`errors.${result.error}`));
    }
  };

  const startEdit = () => {
    setTitle(lyrics.title);
    setTexts(lyrics.sections.map((s) => s.lines.join("\n")));
    setSavedNotice(false);
    setMode("edit");
  };

  const save = () =>
    startTransition(async () => {
      const edited: Lyrics = {
        title: title.trim(),
        sections: lyrics.sections.map((s, i) => ({
          type: s.type,
          lines: (texts[i] ?? "")
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
        })),
      };
      handle(await saveLyricsEditAction(publicRef, edited), () => {
        setMode("view");
        setSavedNotice(true);
      });
    });

  const revise = () =>
    startTransition(async () => {
      handle(await requestRevisionAction(publicRef, feedback), () => setMode("view"));
    });

  const approve = () =>
    startTransition(async () => {
      handle(await approveLyricsAction(publicRef));
    });

  return (
    <div className="flex flex-col gap-5">
      {mode === "view" && <p className="text-neutral-600 dark:text-neutral-300">{t("intro")}</p>}
      {error && <Notice kind="error">{error}</Notice>}
      {savedNotice && mode === "view" && <Notice kind="success">{t("saved")}</Notice>}

      {mode !== "edit" && <LyricsView lyrics={lyrics} />}

      {mode === "edit" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className="text-sm text-neutral-500">{t("editHint")}</p>
          <div>
            <label htmlFor={`${id}-title`} className="mb-1 block font-semibold">
              {t("titleLabel")}
            </label>
            <input
              id={`${id}-title`}
              className={fieldClass}
              value={title}
              maxLength={LYRICS_LIMITS.titleMax}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {lyrics.sections.map((section, i) => (
            <div key={i}>
              <label
                htmlFor={`${id}-s${i}`}
                className="mb-1 block text-sm font-semibold text-brand uppercase"
              >
                {labels[i]}
              </label>
              <textarea
                id={`${id}-s${i}`}
                className={fieldClass}
                rows={Math.max(3, (texts[i] ?? "").split("\n").length + 1)}
                value={texts[i] ?? ""}
                onChange={(e) => setTexts((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
              />
            </div>
          ))}
          <div className="flex gap-3">
            <button type="button" className={secondary} onClick={() => setMode("view")} disabled={pending}>
              {t("cancel")}
            </button>
            <button type="submit" className={`${primary} flex-1`} disabled={pending}>
              {t("save")}
            </button>
          </div>
        </form>
      )}

      {mode === "revise" && (
        <form
          className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800"
          onSubmit={(e) => {
            e.preventDefault();
            revise();
          }}
        >
          <label htmlFor={`${id}-feedback`} className="font-semibold">
            {t("reviseFeedbackLabel")}
          </label>
          <textarea
            id={`${id}-feedback`}
            className={fieldClass}
            rows={3}
            maxLength={500}
            placeholder={t("reviseFeedbackPlaceholder")}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <p className="text-xs text-neutral-500">{t("reviseNote")}</p>
          <div className="flex gap-3">
            <button type="button" className={secondary} onClick={() => setMode("view")} disabled={pending}>
              {t("cancel")}
            </button>
            <button type="submit" className={`${primary} flex-1`} disabled={pending}>
              {t("reviseSubmit")}
            </button>
          </div>
        </form>
      )}

      {mode === "approve" && (
        <div
          role="alertdialog"
          aria-labelledby={`${id}-approve`}
          className="rounded-2xl border border-brand p-4"
        >
          <p id={`${id}-approve`} className="font-semibold">
            {t("approveConfirmTitle")}
          </p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t("approveConfirmText")}</p>
          <div className="mt-3 flex gap-3">
            <button type="button" className={secondary} onClick={() => setMode("view")} disabled={pending}>
              {t("cancel")}
            </button>
            <button type="button" className={`${primary} flex-1`} onClick={approve} disabled={pending}>
              {t("approveConfirm")}
            </button>
          </div>
        </div>
      )}

      {mode === "view" && (
        <div className="flex flex-col gap-3">
          <button type="button" className={secondary} onClick={startEdit} disabled={pending}>
            {t("edit")}
          </button>
          <button
            type="button"
            className={secondary}
            onClick={() => setMode("revise")}
            disabled={pending || revisionsLeft === 0}
          >
            {t("revise")}
          </button>
          <p className="-mt-1 text-center text-xs text-neutral-500" data-testid="revisions-left">
            {t("revisionsLeft", { count: revisionsLeft })}
          </p>
          <button type="button" className={primary} onClick={() => setMode("approve")} disabled={pending}>
            {t("approve")}
          </button>
        </div>
      )}
    </div>
  );
}
