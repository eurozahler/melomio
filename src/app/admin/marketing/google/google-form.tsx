"use client";

import { useId, useState, useTransition } from "react";
import type { MarketingConfig } from "@/marketing/config";
import type { AdminResult } from "../../actions";

const input =
  "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-mono font-normal dark:border-neutral-700 dark:bg-neutral-900";

export function GoogleForm({
  initial,
  save,
}: {
  initial: MarketingConfig;
  save: (input: unknown) => Promise<AdminResult>;
}) {
  const id = useId();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await save(v)));
      }}
    >
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={v.adsEnabled}
          data-testid="ads-enabled"
          onChange={(e) => setV({ ...v, adsEnabled: e.target.checked })}
          className="h-5 w-5"
        />
        Google Ads einschalten (Cookie-Banner + Kauf-Messung)
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={`${id}-a`} className="flex flex-col gap-1 text-sm font-semibold">
          Google-Ads-ID
          <input
            id={`${id}-a`}
            className={input}
            placeholder="AW-123456789"
            value={v.googleAdsId}
            data-testid="ads-id"
            onChange={(e) => setV({ ...v, googleAdsId: e.target.value.trim() })}
          />
        </label>
        <label htmlFor={`${id}-l`} className="flex flex-col gap-1 text-sm font-semibold">
          Conversion-Label „Kauf“
          <input
            id={`${id}-l`}
            className={input}
            placeholder="AbC-dEfGhIj"
            value={v.purchaseLabel}
            onChange={(e) => setV({ ...v, purchaseLabel: e.target.value.trim() })}
          />
        </label>
        <label htmlFor={`${id}-s`} className="flex flex-col gap-1 text-sm font-semibold sm:col-span-2">
          Search-Console-Bestätigungscode (optional)
          <input
            id={`${id}-s`}
            className={input}
            value={v.siteVerification}
            onChange={(e) => setV({ ...v, siteVerification: e.target.value.trim() })}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-strong px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Speichern
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
