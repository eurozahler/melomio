"use client";

import { useId, useMemo, useState, useTransition } from "react";
import type { AdminResult } from "../../actions";

const input =
  "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-normal dark:border-neutral-700 dark:bg-neutral-900";

/** Quellen mit passendem Medium (so erscheinen sie in der Auswertung). */
const SOURCES = [
  { source: "google", medium: "cpc", label: "Google Ads" },
  { source: "facebook", medium: "paid_social", label: "Facebook-Werbung" },
  { source: "instagram", medium: "paid_social", label: "Instagram-Werbung" },
  { source: "tiktok", medium: "paid_social", label: "TikTok-Werbung" },
  { source: "instagram", medium: "social", label: "Instagram-Post / Bio-Link" },
  { source: "tiktok", medium: "social", label: "TikTok-Post / Bio-Link" },
  { source: "newsletter", medium: "email", label: "E-Mail / Newsletter" },
] as const;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export function LinkBuilder({
  baseUrl,
  pages,
}: {
  baseUrl: string;
  pages: { slug: string; name: string; published: boolean; variants: string[] }[];
}) {
  const id = useId();
  const [page, setPage] = useState(pages.find((p) => p.published)?.slug ?? "");
  const [src, setSrc] = useState(0);
  const [campaign, setCampaign] = useState("");
  const [variant, setVariant] = useState("");
  const [copied, setCopied] = useState(false);
  const current = pages.find((p) => p.slug === page);
  const url = useMemo(() => {
    const s = SOURCES[src]!;
    const u = new URL(page ? `/lieder/${page}` : "/", baseUrl);
    u.searchParams.set("utm_source", s.source);
    u.searchParams.set("utm_medium", s.medium);
    if (campaign) u.searchParams.set("utm_campaign", slugify(campaign));
    if (variant) u.searchParams.set("k", variant);
    return u.toString();
  }, [baseUrl, page, src, campaign, variant]);

  return (
    <div className="grid gap-3 rounded-xl border border-neutral-200 p-4 sm:grid-cols-2 dark:border-neutral-800">
      <label htmlFor={`${id}-p`} className="flex flex-col gap-1 text-sm font-semibold">
        Zielseite
        <select
          id={`${id}-p`}
          className={input}
          value={page}
          onChange={(e) => {
            setPage(e.target.value);
            setVariant("");
          }}
        >
          <option value="">Startseite</option>
          {pages.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name} (/lieder/{p.slug}){p.published ? "" : " – noch nicht veröffentlicht"}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-s`} className="flex flex-col gap-1 text-sm font-semibold">
        Wo läuft der Link?
        <select id={`${id}-s`} className={input} value={src} onChange={(e) => setSrc(Number(e.target.value))}>
          {SOURCES.map((s, i) => (
            <option key={s.label} value={i}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-c`} className="flex flex-col gap-1 text-sm font-semibold">
        Kampagne (z. B. „Muttertag 2027“)
        <input id={`${id}-c`} className={input} value={campaign} onChange={(e) => setCampaign(e.target.value)} />
      </label>
      <label htmlFor={`${id}-v`} className="flex flex-col gap-1 text-sm font-semibold">
        Seiten-Variante (optional)
        <select id={`${id}-v`} className={input} value={variant} onChange={(e) => setVariant(e.target.value)}>
          <option value="">Standard</option>
          {current?.variants.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <code
          className="rounded-lg bg-neutral-100 px-3 py-2 text-xs break-all dark:bg-neutral-900"
          data-testid="built-link"
        >
          {url}
        </code>
        <button
          type="button"
          className="self-start rounded-lg bg-brand-strong px-4 py-2 text-sm font-semibold text-white"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Kopieren nicht erlaubt – der Link steht oben zum Markieren
            }
          }}
        >
          {copied ? "Kopiert ✓" : "Link kopieren"}
        </button>
      </div>
    </div>
  );
}

export function AdCostForm({ month, save }: { month: string; save: (input: unknown) => Promise<AdminResult> }) {
  const id = useId();
  const [v, setV] = useState({ month, source: "google", campaign: "", euro: "", note: "" });
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const sources = [...new Set(SOURCES.map((s) => s.source))];
  return (
    <form
      className="grid gap-3 rounded-xl border border-neutral-200 p-4 sm:grid-cols-5 dark:border-neutral-800"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await save({
            month: v.month,
            source: v.source,
            campaign: slugify(v.campaign),
            costCents: Math.round(Number(v.euro.replace(/\./g, "").replace(",", ".")) * 100),
            note: v.note || null,
          });
          setResult(r);
          if (r.ok) setV({ ...v, euro: "", note: "" });
        });
      }}
    >
      <label htmlFor={`${id}-m`} className="flex flex-col gap-1 text-sm font-semibold">
        Monat
        <input
          id={`${id}-m`}
          type="month"
          className={input}
          value={v.month}
          onChange={(e) => setV({ ...v, month: e.target.value })}
        />
      </label>
      <label htmlFor={`${id}-s`} className="flex flex-col gap-1 text-sm font-semibold">
        Quelle
        <input
          id={`${id}-s`}
          list={`${id}-sl`}
          className={input}
          value={v.source}
          onChange={(e) => setV({ ...v, source: e.target.value.toLowerCase() })}
        />
        <datalist id={`${id}-sl`}>
          {sources.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <label htmlFor={`${id}-c`} className="flex flex-col gap-1 text-sm font-semibold">
        Kampagne (optional)
        <input
          id={`${id}-c`}
          className={input}
          value={v.campaign}
          onChange={(e) => setV({ ...v, campaign: e.target.value })}
        />
      </label>
      <label htmlFor={`${id}-e`} className="flex flex-col gap-1 text-sm font-semibold">
        Kosten in €
        <input
          id={`${id}-e`}
          inputMode="decimal"
          required
          className={input}
          value={v.euro}
          data-testid="adcost-euro"
          onChange={(e) => setV({ ...v, euro: e.target.value })}
        />
      </label>
      <label htmlFor={`${id}-n`} className="flex flex-col gap-1 text-sm font-semibold">
        Notiz
        <input id={`${id}-n`} className={input} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-5">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-strong px-5 py-2 text-sm font-semibold text-white"
        >
          Kosten speichern
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
