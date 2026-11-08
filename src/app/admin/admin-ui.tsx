"use client";

import { useState, useTransition } from "react";
import type { AdminResult } from "./actions";

/** Knopf für eine Admin-Aktion mit Rückmeldung. */
export function ActionButton({
  label,
  action,
  confirmText,
  variant = "primary",
}: {
  label: string;
  action: () => Promise<AdminResult>;
  confirmText?: string;
  variant?: "primary" | "secondary";
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
          variant === "primary"
            ? "bg-brand-strong text-white"
            : "border border-neutral-300 dark:border-neutral-700"
        }`}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          start(async () => setResult(await action()));
        }}
      >
        {label}
      </button>
      {result && (
        <p role="status" className={`text-xs ${result.ok ? "text-green-700" : "text-red-700"}`}>
          {result.ok ? result.message : result.error}
        </p>
      )}
    </div>
  );
}

/** Ein Eingabefeld mit „Speichern“ (Einstellungen, Preis). */
export function SaveField({
  label,
  hint,
  defaultValue,
  inputMode = "numeric",
  testId,
  save,
}: {
  label: string;
  hint?: string;
  defaultValue: string;
  inputMode?: "numeric" | "decimal";
  testId?: string;
  save: (value: string) => Promise<AdminResult>;
}) {
  const [value, setValue] = useState(defaultValue);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  return (
    <form
      className="flex flex-col gap-1 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await save(value)));
      }}
    >
      <label className="text-sm font-semibold">
        {label}
        <div className="mt-1 flex gap-2">
          <input
            value={value}
            inputMode={inputMode}
            onChange={(e) => setValue(e.target.value)}
            className="w-32 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-normal dark:border-neutral-700 dark:bg-neutral-900"
            data-testid={testId}
          />
          <button
            disabled={pending}
            className="rounded-lg bg-brand-strong px-3 py-1.5 text-sm text-white disabled:opacity-60"
          >
            Speichern
          </button>
        </div>
      </label>
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      {result && (
        <p role="status" className={`text-xs ${result.ok ? "text-green-700" : "text-red-700"}`}>
          {result.ok ? result.message : result.error}
        </p>
      )}
    </form>
  );
}
