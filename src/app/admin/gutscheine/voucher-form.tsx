"use client";

import { useState, useTransition } from "react";
import type { AdminResult } from "../actions";

const input =
  "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-normal dark:border-neutral-700 dark:bg-neutral-900";

export function VoucherForm({ create }: { create: (input: unknown) => Promise<AdminResult> }) {
  const [v, setV] = useState({
    code: "",
    kind: "percent",
    value: "10",
    maxRedemptions: "",
    validUntil: "",
    note: "",
  });
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  return (
    <form
      className="grid gap-3 rounded-xl border border-neutral-200 p-4 sm:grid-cols-3 dark:border-neutral-800"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () =>
          setResult(
            await create({
              code: v.code,
              kind: v.kind,
              value:
                v.kind === "fixed" ? Math.round(Number(v.value.replace(",", ".")) * 100) : Number(v.value),
              maxRedemptions: v.maxRedemptions ? Number(v.maxRedemptions) : null,
              validUntil: v.validUntil ? `${v.validUntil}T23:59:59+01:00` : null,
              note: v.note || null,
            }),
          ),
        );
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Code
        <input
          className={`${input} uppercase`}
          value={v.code}
          data-testid="voucher-new-code"
          onChange={(e) => setV({ ...v, code: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Art
        <select className={input} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
          <option value="percent">Prozent</option>
          <option value="fixed">Festbetrag (€)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {v.kind === "percent" ? "Rabatt in %" : "Rabatt in €"}
        <input
          className={input}
          inputMode="decimal"
          value={v.value}
          data-testid="voucher-new-value"
          onChange={(e) => setV({ ...v, value: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Höchstens einlösbar (optional)
        <input
          className={input}
          inputMode="numeric"
          value={v.maxRedemptions}
          onChange={(e) => setV({ ...v, maxRedemptions: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Gültig bis (optional)
        <input
          className={input}
          type="date"
          value={v.validUntil}
          onChange={(e) => setV({ ...v, validUntil: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Notiz (intern)
        <input className={input} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-strong px-5 py-2 text-sm font-semibold text-white"
        >
          Gutschein anlegen
        </button>
        {result && (
          <p role="status" className={`text-sm ${result.ok ? "text-green-700" : "text-red-700"}`}>
            {result.ok ? result.message : result.error}
          </p>
        )}
      </div>
    </form>
  );
}
