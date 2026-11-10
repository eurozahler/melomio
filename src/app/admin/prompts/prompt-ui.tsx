"use client";

import { useState, useTransition } from "react";
import type { AdminResult } from "../actions";
import type { PromptTestResult } from "./actions";

const SECTION_LABEL: Record<string, string> = {
  intro: "Intro",
  verse: "Strophe",
  chorus: "Refrain",
  bridge: "Bridge",
  outro: "Outro",
};

/** Prompt bearbeiten, testen, als neue Fassung speichern. */
export function PromptEditor({
  initial,
  models,
  providerName,
  save,
  test,
}: {
  initial: { template: string; model: string };
  models: ReadonlyArray<{ value: string; label: string }>;
  providerName: string;
  save: (input: unknown) => Promise<AdminResult>;
  test: (input: unknown) => Promise<PromptTestResult>;
}) {
  const [values, setValues] = useState(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const [preview, setPreview] = useState<PromptTestResult | null>(null);
  const changed = values.template !== initial.template || values.model !== initial.model;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Modell
        <select
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-normal dark:border-neutral-700 dark:bg-neutral-900"
          value={values.model}
          onChange={(e) => setValues({ ...values, model: e.target.value })}
        >
          {models.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Anweisungen an die KI (System-Prompt)
        <textarea
          rows={18}
          data-testid="prompt-template"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-xs font-normal dark:border-neutral-700 dark:bg-neutral-900"
          value={values.template}
          onChange={(e) => setValues({ ...values, template: e.target.value })}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          data-testid="prompt-test"
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold disabled:opacity-60 dark:border-neutral-700"
          onClick={() => {
            if (
              providerName !== "mock" &&
              !window.confirm(
                "Testlauf mit der Beispielbestellung starten? Das kostet wenige Cent bei Anthropic.",
              )
            )
              return;
            setPreview(null);
            start(async () => setPreview(await test(values)));
          }}
        >
          {pending
            ? "Läuft …"
            : providerName === "mock"
              ? "Testlauf (Test-Baustein)"
              : "Testlauf (kostet wenige Cent)"}
        </button>
        <button
          type="button"
          disabled={pending || !changed}
          data-testid="prompt-save"
          className="rounded-lg bg-brand-strong px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          onClick={() => start(async () => setResult(await save(values)))}
        >
          Als neue Fassung speichern
        </button>
        {result && (
          <p role="status" className={`text-sm ${result.ok ? "text-green-700" : "text-red-700"}`}>
            {result.ok ? result.message : result.error}
          </p>
        )}
      </div>
      {preview && (
        <div
          className="rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800"
          data-testid="prompt-preview"
        >
          {preview.ok ? (
            <>
              <p className="mb-2 text-xs text-neutral-500">
                Ergebnis für die Beispielbestellung „Anna, 30“ · {preview.provider} · {preview.model}
              </p>
              <p className="mb-2 text-lg font-bold">{preview.title}</p>
              {preview.sections.map((s, i) => (
                <div key={i} className="mb-2">
                  <p className="text-xs font-bold text-brand uppercase">{SECTION_LABEL[s.type] ?? s.type}</p>
                  {s.lines.map((l, j) => (
                    <p key={j}>{l}</p>
                  ))}
                </div>
              ))}
            </>
          ) : (
            <p className="text-red-700">{preview.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
