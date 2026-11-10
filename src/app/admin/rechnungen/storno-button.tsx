"use client";

import { useState, useTransition } from "react";
import type { AdminResult } from "../actions";

/** Stornorechnung erstellen – mit Rückfrage und optionalem Grund. */
export function StornoButton({
  number,
  cancel,
}: {
  number: string;
  cancel: (reason: string | null) => Promise<AdminResult>;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        className="text-xs font-semibold text-red-700 underline disabled:opacity-60"
        onClick={() => {
          const reason = window.prompt(
            `Stornorechnung zu ${number} erstellen?\nDas lässt sich nicht rückgängig machen. Die Rückzahlung selbst bitte in Mollie auslösen.\n\nGrund (optional):`,
          );
          if (reason === null) return;
          start(async () => setResult(await cancel(reason || null)));
        }}
      >
        Stornieren
      </button>
      {result && (
        <span role="status" className={`text-xs ${result.ok ? "text-green-700" : "text-red-700"}`}>
          {result.ok ? result.message : result.error}
        </span>
      )}
    </span>
  );
}
