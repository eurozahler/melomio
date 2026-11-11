"use client";

import { useState, useTransition } from "react";
import type { AdminResult } from "../actions";
import { setRatesAction } from "./actions";

/** Rabatt und Provision je Partner (leer = Standard). */
export function RatesForm({
  id,
  discount,
  commission,
  defaults,
}: {
  id: string;
  discount: string;
  commission: string;
  defaults: { discount: number; commission: number };
}) {
  const [d, setD] = useState(discount);
  const [c, setC] = useState(commission);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const input =
    "w-20 rounded-lg border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900";
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await setRatesAction(id, d, c)));
      }}
    >
      <label className="flex flex-col text-xs font-semibold">
        Kundenrabatt %
        <input
          className={input}
          value={d}
          placeholder={String(defaults.discount)}
          inputMode="numeric"
          onChange={(e) => setD(e.target.value)}
        />
      </label>
      <label className="flex flex-col text-xs font-semibold">
        Provision %
        <input
          className={input}
          value={c}
          placeholder={String(defaults.commission)}
          inputMode="numeric"
          onChange={(e) => setC(e.target.value)}
        />
      </label>
      <button
        disabled={pending}
        className="rounded-lg bg-brand-strong px-3 py-1.5 text-sm text-white disabled:opacity-60"
      >
        Speichern
      </button>
      {result && (
        <span role="status" className={`text-xs ${result.ok ? "text-green-700" : "text-red-700"}`}>
          {result.ok ? result.message : result.error}
        </span>
      )}
    </form>
  );
}
