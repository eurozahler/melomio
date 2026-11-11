"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { DraftQuestion } from "@/admin/questionnaire";
import type { QuestionType } from "@/domain/questionnaire";
import type { AdminResult } from "../actions";

const TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: "text", label: "Kurzer Text (eine Zeile)" },
  { value: "textarea", label: "Langer Text (mehrere Zeilen, Diktat möglich)" },
  { value: "single_choice", label: "Auswahl (eine Antwort)" },
  { value: "multi_choice", label: "Auswahl (mehrere Antworten)" },
  { value: "date", label: "Datum" },
];
const isChoice = (t: QuestionType) => t === "single_choice" || t === "multi_choice";

const input =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-normal dark:border-neutral-700 dark:bg-neutral-900";
const small =
  "rounded-lg border border-neutral-300 px-2 py-1 text-xs font-semibold disabled:opacity-40 dark:border-neutral-700";

function Status({ result }: { result: AdminResult | null }) {
  if (!result) return null;
  return (
    <p role="status" className={`text-sm ${result.ok ? "text-green-700" : "text-red-700"}`}>
      {result.ok ? result.message : result.error}
    </p>
  );
}

function Field({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm font-semibold ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-neutral-500">{hint}</span>}
    </label>
  );
}

/** Aus einem Antworttext eine Kennung machen („Ja, gerne!“ → „ja_gerne“). */
function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "antwort"
  );
}

export function NewOccasionForm({ create }: { create: (input: unknown) => Promise<AdminResult> }) {
  const [values, setValues] = useState({ slug: "", name: "", description: "" });
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  return (
    <form
      className="grid gap-3 rounded-xl border border-neutral-200 p-4 sm:grid-cols-2 dark:border-neutral-800"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await create(values)));
      }}
    >
      <Field label="Name" hint="z. B. Muttertag">
        <input
          className={input}
          value={values.name}
          data-testid="new-occasion-name"
          onChange={(e) =>
            setValues({
              ...values,
              name: e.target.value,
              slug: values.slug || slugify(e.target.value).replace(/_/g, "-"),
            })
          }
        />
      </Field>
      <Field label="Adresse" hint="erscheint als melomio.de/song/…">
        <input
          className={input}
          value={values.slug}
          data-testid="new-occasion-slug"
          onChange={(e) => setValues({ ...values, slug: e.target.value })}
        />
      </Field>
      <Field label="Kurzbeschreibung (optional)" wide>
        <input
          className={input}
          value={values.description}
          onChange={(e) => setValues({ ...values, description: e.target.value })}
        />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-strong px-5 py-2 text-sm font-semibold text-white"
        >
          Anlass anlegen
        </button>
        <Status result={result} />
      </div>
    </form>
  );
}

export function OccasionSettings({
  initial,
  save,
}: {
  initial: { name: string; description: string; active: boolean };
  save: (input: unknown) => Promise<AdminResult>;
}) {
  const [values, setValues] = useState(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await save(values)));
      }}
    >
      <Field label="Name">
        <input
          className={input}
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
      </Field>
      <Field label="Kurzbeschreibung">
        <input
          className={input}
          value={values.description}
          onChange={(e) => setValues({ ...values, description: e.target.value })}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={values.active}
          data-testid="occasion-active"
          onChange={(e) => setValues({ ...values, active: e.target.checked })}
        />
        Auf der Startseite anzeigen
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={small}>
          Speichern
        </button>
        <Status result={result} />
      </div>
    </form>
  );
}

/** Veröffentlichung und Video je Anlass: Dropbox-Ordner, Rabatt, Vorlage. */
export function OccasionPublishing({
  initial,
  defaults,
  save,
}: {
  initial: { folder: string; discountPct: string; videoTemplate: "standard" | "memorial" };
  defaults: { folder: string; discountPct: number };
  save: (input: unknown) => Promise<AdminResult>;
}) {
  const [values, setValues] = useState(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await save(values)));
      }}
    >
      <Field label="Dropbox-Ordner">
        <input
          className={input}
          value={values.folder}
          placeholder={`${defaults.folder} (Standard)`}
          data-testid="occasion-folder"
          onChange={(e) => setValues({ ...values, folder: e.target.value })}
        />
      </Field>
      <Field label="Rabatt für Veröffentlichung (%)">
        <input
          className={input}
          value={values.discountPct}
          inputMode="numeric"
          placeholder={`${defaults.discountPct} (Standard)`}
          data-testid="occasion-discount"
          onChange={(e) => setValues({ ...values, discountPct: e.target.value })}
        />
      </Field>
      <Field label="Videovorlage">
        <select
          className={input}
          value={values.videoTemplate}
          data-testid="occasion-template"
          onChange={(e) => setValues({ ...values, videoTemplate: e.target.value as "standard" | "memorial" })}
        >
          <option value="standard">Standard (Farbverlauf/Fotos)</option>
          <option value="memorial">Trauer: Abschiedsvideo (Foto s/w, Daten, Spruch)</option>
        </select>
      </Field>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={pending} className={small}>
          Speichern
        </button>
        <Status result={result} />
      </div>
    </form>
  );
}

const emptyQuestion = (n: number): DraftQuestion => ({
  key: `frage_${n}`,
  type: "textarea",
  label: "",
  help: null,
  placeholder: null,
  required: false,
  maxLength: null,
  condition: null,
  options: [],
});

/** Editor für den Entwurf: Fragen hinzufügen, ändern, sortieren, löschen. */
export function QuestionnaireEditor({
  initial,
  save,
  publish,
  discard,
}: {
  initial: DraftQuestion[];
  save: (questions: DraftQuestion[]) => Promise<AdminResult>;
  publish: () => Promise<AdminResult>;
  discard: () => Promise<AdminResult>;
}) {
  const [qs, setQs] = useState<DraftQuestion[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);

  const update = (i: number, patch: Partial<DraftQuestion>) => {
    setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...qs];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    setQs(next);
    setDirty(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {qs.map((q, i) => {
        const earlierChoices = qs.slice(0, i).filter((p) => isChoice(p.type));
        const ref = q.condition ? earlierChoices.find((p) => p.key === q.condition!.questionKey) : undefined;
        return (
          <fieldset
            key={i}
            data-testid="question-card"
            className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <legend className="px-1 text-sm font-bold">Frage {i + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Frage" wide>
                <input
                  className={input}
                  value={q.label}
                  data-testid="question-label"
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </Field>
              <Field label="Art der Antwort">
                <select
                  className={input}
                  value={q.type}
                  onChange={(e) => {
                    const type = e.target.value as QuestionType;
                    update(i, {
                      type,
                      options: isChoice(type)
                        ? q.options.length
                          ? q.options
                          : [
                              { value: "ja", label: "Ja" },
                              { value: "nein", label: "Nein" },
                            ]
                        : [],
                    });
                  }}
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Kennung"
                hint="intern; recipient_name / partner_name / couple_names = Name im Song"
              >
                <input className={input} value={q.key} onChange={(e) => update(i, { key: e.target.value })} />
              </Field>
              <Field label="Hilfetext (optional)">
                <input
                  className={input}
                  value={q.help ?? ""}
                  onChange={(e) => update(i, { help: e.target.value || null })}
                />
              </Field>
              {!isChoice(q.type) && q.type !== "date" && (
                <>
                  <Field label="Beispiel im Feld (optional)">
                    <input
                      className={input}
                      value={q.placeholder ?? ""}
                      onChange={(e) => update(i, { placeholder: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Höchstlänge in Zeichen (optional)">
                    <input
                      className={input}
                      inputMode="numeric"
                      value={q.maxLength ?? ""}
                      onChange={(e) =>
                        update(i, { maxLength: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </Field>
                </>
              )}
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                Pflichtfrage
              </label>
            </div>

            {isChoice(q.type) && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">Antworten</p>
                {q.options.map((o, j) => (
                  <div key={j} className="flex gap-2">
                    <input
                      className={input}
                      value={o.label}
                      aria-label={`Antwort ${j + 1}`}
                      onChange={(e) => {
                        const options = q.options.map((x, k) =>
                          k === j ? { label: e.target.value, value: slugify(e.target.value) } : x,
                        );
                        update(i, { options });
                      }}
                    />
                    <button
                      type="button"
                      className={small}
                      onClick={() => update(i, { options: q.options.filter((_, k) => k !== j) })}
                    >
                      Entfernen
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={`${small} self-start`}
                  onClick={() =>
                    update(i, {
                      options: [...q.options, { value: `antwort_${q.options.length + 1}`, label: "" }],
                    })
                  }
                >
                  + Antwort
                </button>
              </div>
            )}

            {earlierChoices.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nur zeigen, wenn …" hint="Folgefrage: erscheint nur bei bestimmten Antworten">
                  <select
                    className={input}
                    value={q.condition?.questionKey ?? ""}
                    onChange={(e) => {
                      const target = earlierChoices.find((p) => p.key === e.target.value);
                      update(i, {
                        condition: target
                          ? { questionKey: target.key, anyOf: [target.options[0]?.value ?? ""] }
                          : null,
                      });
                    }}
                  >
                    <option value="">immer zeigen</option>
                    {earlierChoices.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label || p.key}
                      </option>
                    ))}
                  </select>
                </Field>
                {ref && (
                  <Field label="… diese Antwort gewählt ist">
                    <select
                      className={input}
                      value={q.condition!.anyOf[0] ?? ""}
                      onChange={(e) =>
                        update(i, { condition: { questionKey: ref.key, anyOf: [e.target.value] } })
                      }
                    >
                      {ref.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" className={small} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑ nach oben
              </button>
              <button
                type="button"
                className={small}
                disabled={i === qs.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓ nach unten
              </button>
              <button
                type="button"
                className={`${small} text-red-700`}
                onClick={() => {
                  if (!window.confirm("Diese Frage löschen?")) return;
                  setQs(qs.filter((_, j) => j !== i));
                  setDirty(true);
                }}
              >
                Löschen
              </button>
            </div>
          </fieldset>
        );
      })}

      <button
        type="button"
        className={`${small} self-start`}
        data-testid="add-question"
        onClick={() => {
          setQs([...qs, emptyQuestion(qs.length + 1)]);
          setDirty(true);
        }}
      >
        + Frage hinzufügen
      </button>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-neutral-200 bg-white py-3 dark:border-neutral-800 dark:bg-neutral-950">
        <button
          type="button"
          disabled={pending}
          data-testid="save-draft"
          className="rounded-lg bg-brand-strong px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() =>
            start(async () => {
              const r = await save(qs);
              setResult(r);
              if (r.ok) setDirty(false);
            })
          }
        >
          Entwurf speichern
        </button>
        <button
          type="button"
          disabled={pending || dirty}
          data-testid="publish-draft"
          title={dirty ? "Zuerst speichern" : undefined}
          className="rounded-lg border border-green-600 px-5 py-2 text-sm font-semibold text-green-800 disabled:opacity-40 dark:text-green-300"
          onClick={() => {
            if (!window.confirm("Entwurf veröffentlichen? Er gilt sofort für alle neuen Bestellungen."))
              return;
            start(async () => setResult(await publish()));
          }}
        >
          Veröffentlichen
        </button>
        <button
          type="button"
          disabled={pending}
          className={small}
          onClick={() => {
            if (!window.confirm("Entwurf verwerfen? Alle Änderungen gehen verloren.")) return;
            start(async () => setResult(await discard()));
          }}
        >
          Entwurf verwerfen
        </button>
        {dirty && <span className="text-xs text-amber-700">Ungespeicherte Änderungen</span>}
        <Status result={result} />
      </div>
    </div>
  );
}

export function StartDraftButton({ start: startDraft }: { start: () => Promise<AdminResult> }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        data-testid="start-draft"
        className="rounded-lg bg-brand-strong px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        onClick={() => start(async () => setResult(await startDraft()))}
      >
        Fragebogen bearbeiten
      </button>
      <Status result={result} />
    </div>
  );
}
