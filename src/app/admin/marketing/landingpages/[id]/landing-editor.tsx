"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { LandingContent } from "@/marketing/landing";
import type { AdminResult } from "../../../actions";
import type { DraftResult } from "../../actions";

const input =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-normal dark:border-neutral-700 dark:bg-neutral-900";
const smallBtn = "rounded-lg border border-neutral-300 px-3 py-1 text-xs font-semibold dark:border-neutral-700";

function Counter({ value, ideal, max }: { value: string; ideal: [number, number]; max: number }) {
  const n = value.length;
  const ok = n >= ideal[0] && n <= ideal[1];
  return (
    <span className={`text-xs font-normal ${ok ? "text-green-700" : n > max ? "text-red-700" : "text-neutral-500"}`}>
      {n} Zeichen (ideal {ideal[0]}–{ideal[1]})
    </span>
  );
}

function Field({ label, children, extra }: { label: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      <span className="flex flex-wrap items-center justify-between gap-2">
        {label}
        {extra}
      </span>
      {children}
    </label>
  );
}

export function LandingEditor({
  occasionId,
  exists,
  initial,
  baseUrl,
  aiAvailable,
  save,
  publish,
  aiDraft,
}: {
  occasionId: string;
  exists: boolean;
  initial: LandingContent;
  baseUrl: string;
  aiAvailable: boolean;
  save: (occasionId: string, input: unknown) => Promise<AdminResult>;
  publish: (occasionId: string, published: boolean) => Promise<AdminResult>;
  aiDraft: (occasionId: string, keyword: string) => Promise<DraftResult>;
}) {
  const id = useId();
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [saved, setSaved] = useState(exists);
  const [dirty, setDirty] = useState(!exists);
  const [keyword, setKeyword] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const update = (patch: Partial<LandingContent>) => {
    setC((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };
  const payload = () => ({
    slug: c.slug,
    metaTitle: c.metaTitle,
    metaDescription: c.metaDescription,
    h1: c.h1,
    intro: c.intro,
    highlights: c.highlights,
    sections: c.sections,
    faqs: c.faqs,
    variants: c.variants,
    ctaLabel: c.ctaLabel,
    sampleTitle: c.sampleTitle || null,
  });
  const show = (r: AdminResult) => setResult(r);
  const url = `${baseUrl}/lieder/${c.slug}`;

  const doSave = () =>
    start(async () => {
      const r = await save(occasionId, payload());
      show(r);
      if (r.ok) {
        setSaved(true);
        setDirty(false);
        router.refresh();
      }
    });

  const uploadSample = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/admin/hoerbeispiel/${occasionId}`, { method: "POST", body: form });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    show(data.ok ? { ok: true, message: "Hörbeispiel hochgeladen." } : { ok: false, error: data.error ?? "Fehler." });
    if (data.ok) {
      setC((prev) => ({ ...prev, sampleAudioKey: "neu" }));
      router.refresh();
    }
  };

  const removeSample = async () => {
    if (!window.confirm("Hörbeispiel entfernen?")) return;
    const res = await fetch(`/api/admin/hoerbeispiel/${occasionId}`, { method: "DELETE" });
    show(res.ok ? { ok: true, message: "Hörbeispiel entfernt." } : { ok: false, error: "Fehler." });
    if (res.ok) setC((prev) => ({ ...prev, sampleAudioKey: null }));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Kopfleiste */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white/95 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold ${c.published ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-700"}`}
        >
          {c.published ? "Online" : "Entwurf"}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={doSave}
          data-testid="landing-save"
          className="rounded-lg bg-brand-strong px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Speichern
        </button>
        {saved && (
          <button
            type="button"
            disabled={pending || dirty}
            title={dirty ? "Bitte zuerst speichern" : undefined}
            data-testid="landing-publish"
            onClick={() =>
              start(async () => {
                const next = !c.published;
                if (next && !window.confirm(`Seite veröffentlichen? Sie ist dann unter ${url} für alle sichtbar.`)) return;
                const r = await publish(occasionId, next);
                show(r);
                if (r.ok) setC((prev) => ({ ...prev, published: next }));
              })
            }
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-neutral-700"
          >
            {c.published ? "Offline nehmen" : "Veröffentlichen"}
          </button>
        )}
        {saved && (
          <a href={`/lieder/${c.slug}`} target="_blank" rel="noreferrer" className="text-sm underline">
            {c.published ? "Seite ansehen" : "Vorschau"}
          </a>
        )}
        {dirty && <span className="text-xs text-amber-700">Ungespeicherte Änderungen</span>}
        {result && (
          <span role="status" className={`text-sm ${result.ok ? "text-green-700" : "text-red-700"}`}>
            {result.ok ? result.message : result.error}
          </span>
        )}
      </div>

      {/* KI-Entwurf */}
      <section className="flex flex-col gap-2 rounded-xl border border-dashed border-brand/50 p-4">
        <h2 className="font-bold">KI-Entwurf</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {aiAvailable
            ? "Claude schreibt Titel, Texte und häufige Fragen für dieses Hauptsuchwort. Kostet pro Klick etwa 2–5 Cent. Der Entwurf ersetzt die Felder unten, wird aber erst mit „Speichern“ übernommen."
            : "KI ist hier nicht eingerichtet (Testbaustein) – der Knopf füllt den festen Vorschlag ein."}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Hauptsuchwort">
            <input
              className={`${input} sm:w-80`}
              placeholder="z. B. geburtstagslied personalisiert"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </Field>
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand-strong disabled:opacity-60"
            onClick={() => {
              if (!window.confirm("Felder unten durch einen neuen Entwurf ersetzen?")) return;
              start(async () => {
                const r = await aiDraft(occasionId, keyword);
                if (!r.ok) return show(r);
                setC((prev) => ({
                  ...r.content,
                  slug: prev.slug,
                  published: prev.published,
                  sampleAudioKey: prev.sampleAudioKey,
                  sampleTitle: prev.sampleTitle,
                }));
                setDirty(true);
                show({ ok: true, message: r.usedAi ? "KI-Entwurf eingefügt – bitte prüfen und speichern." : "Vorschlag eingefügt." });
              });
            }}
          >
            {pending ? "Bitte warten …" : "Entwurf erstellen"}
          </button>
        </div>
      </section>

      {/* Google-Vorschau + Grunddaten */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Suche &amp; Adresse</h2>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900" aria-label="So erscheint die Seite bei Google">
          <p className="text-xs text-neutral-500">So ungefähr erscheint die Seite bei Google:</p>
          <p className="mt-2 truncate text-xs text-neutral-600 dark:text-neutral-400">{url}</p>
          <p className="truncate text-lg text-[#1a0dab] dark:text-[#8ab4f8]">{c.metaTitle || "Seitentitel fehlt"}</p>
          <p className="line-clamp-2 text-sm text-neutral-700 dark:text-neutral-300">
            {c.metaDescription || "Beschreibung fehlt"}
          </p>
        </div>
        <Field label="Adresse (/lieder/…)" extra={<span className="text-xs font-normal text-neutral-500">nur a–z, 0–9, Bindestrich</span>}>
          <input
            className={`${input} font-mono`}
            value={c.slug}
            data-testid="landing-slug"
            onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
          />
        </Field>
        {c.published && initial.slug !== c.slug && (
          <p className="text-xs text-amber-700">
            Achtung: Die Seite ist schon online. Eine neue Adresse macht alte Links und Anzeigen ungültig.
          </p>
        )}
        <Field label="Seitentitel (Google + Browser-Tab)" extra={<Counter value={c.metaTitle} ideal={[40, 60]} max={70} />}>
          <input className={input} value={c.metaTitle} maxLength={70} onChange={(e) => update({ metaTitle: e.target.value })} />
        </Field>
        <Field label="Beschreibung (Google)" extra={<Counter value={c.metaDescription} ideal={[120, 160]} max={170} />}>
          <textarea
            className={input}
            rows={2}
            maxLength={170}
            value={c.metaDescription}
            onChange={(e) => update({ metaDescription: e.target.value })}
          />
        </Field>
      </section>

      {/* Inhalt */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Einstieg</h2>
        <Field label="Überschrift (H1)" extra={<Counter value={c.h1} ideal={[20, 80]} max={120} />}>
          <input className={input} value={c.h1} maxLength={120} data-testid="landing-h1-input" onChange={(e) => update({ h1: e.target.value })} />
        </Field>
        <Field label="Einleitung">
          <textarea className={input} rows={3} maxLength={800} value={c.intro} onChange={(e) => update({ intro: e.target.value })} />
        </Field>
        <Field label="Knopf-Text">
          <input
            className={`${input} sm:w-72`}
            maxLength={60}
            placeholder="Jetzt Song erstellen"
            value={c.ctaLabel}
            onChange={(e) => update({ ctaLabel: e.target.value })}
          />
        </Field>
        <ListEditor
          title="Vorteile (Häkchen-Liste)"
          items={c.highlights}
          max={8}
          empty=""
          onChange={(highlights) => update({ highlights })}
          render={(h, set) => <input className={input} maxLength={140} value={h} onChange={(e) => set(e.target.value)} />}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Hörbeispiel</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Ein fertiger Beispiel-Song (MP3, höchstens 15 MB) macht die Seite deutlich überzeugender. Nur Songs
          verwenden, an denen du die Rechte hast und in denen keine echten Kundendaten vorkommen.
        </p>
        {!saved ? (
          <p className="text-sm text-neutral-500">Bitte die Seite zuerst speichern.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {c.sampleAudioKey && <audio controls preload="none" src={`/api/hoerbeispiel/${initial.slug}`} className="w-full" />}
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Titel des Beispiels (optional)">
                <input
                  className={`${input} sm:w-72`}
                  maxLength={120}
                  value={c.sampleTitle ?? ""}
                  onChange={(e) => update({ sampleTitle: e.target.value })}
                />
              </Field>
              <input
                ref={fileRef}
                type="file"
                accept="audio/mpeg,.mp3"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) start(() => uploadSample(f));
                  e.target.value = "";
                }}
              />
              <button type="button" className={smallBtn} onClick={() => fileRef.current?.click()}>
                {c.sampleAudioKey ? "Anderes MP3 hochladen" : "MP3 hochladen"}
              </button>
              {c.sampleAudioKey && (
                <button type="button" className={smallBtn} onClick={removeSample}>
                  Entfernen
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Abschnitte</h2>
        <ListEditor
          title=""
          items={c.sections}
          max={10}
          empty={{ heading: "", body: "" }}
          onChange={(sections) => update({ sections })}
          render={(s, set) => (
            <div className="flex flex-col gap-2">
              <input
                className={`${input} font-semibold`}
                placeholder="Zwischenüberschrift"
                maxLength={120}
                value={s.heading}
                onChange={(e) => set({ ...s, heading: e.target.value })}
              />
              <textarea
                className={input}
                rows={4}
                placeholder="Text (Leerzeile = neuer Absatz)"
                maxLength={3000}
                value={s.body}
                onChange={(e) => set({ ...s, body: e.target.value })}
              />
            </div>
          )}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Häufige Fragen</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Erscheinen auf der Seite und – als strukturierte Daten – möglicherweise direkt in den Google-Ergebnissen.
        </p>
        <ListEditor
          title=""
          items={c.faqs}
          max={15}
          empty={{ q: "", a: "" }}
          onChange={(faqs) => update({ faqs })}
          render={(f, set) => (
            <div className="flex flex-col gap-2">
              <input className={`${input} font-semibold`} placeholder="Frage" maxLength={200} value={f.q} onChange={(e) => set({ ...f, q: e.target.value })} />
              <textarea className={input} rows={2} placeholder="Antwort" maxLength={1500} value={f.a} onChange={(e) => set({ ...f, a: e.target.value })} />
            </div>
          )}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Varianten für Anzeigen</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Für eine Kampagne eine eigene Überschrift zeigen, z. B. Kürzel <code>muttertag</code> → Link{" "}
          <code>/lieder/{c.slug}?k=muttertag</code>. Leere Felder übernehmen den Standardtext. Google sieht immer
          die Standardseite.
        </p>
        <ListEditor
          title=""
          items={c.variants}
          max={20}
          empty={{ key: "", h1: "", intro: "" }}
          onChange={(variants) => update({ variants })}
          render={(v, set) => (
            <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <input
                className={`${input} font-mono`}
                placeholder="kuerzel"
                maxLength={40}
                aria-label={`${id} Kürzel`}
                value={v.key}
                onChange={(e) => set({ ...v, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
              />
              <input className={input} placeholder="Überschrift" maxLength={120} value={v.h1} onChange={(e) => set({ ...v, h1: e.target.value })} />
              <textarea
                className={`${input} sm:col-span-2`}
                rows={2}
                placeholder="Einleitung (optional)"
                maxLength={800}
                value={v.intro}
                onChange={(e) => set({ ...v, intro: e.target.value })}
              />
            </div>
          )}
        />
      </section>

      <div className="flex justify-end pb-8">
        <button
          type="button"
          disabled={pending}
          onClick={doSave}
          className="rounded-lg bg-brand-strong px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Speichern
        </button>
      </div>
    </div>
  );
}

/** Liste mit Hinzufügen, Entfernen und Verschieben. */
function ListEditor<T>({
  title,
  items,
  max,
  empty,
  onChange,
  render,
}: {
  title: string;
  items: T[];
  max: number;
  empty: T;
  onChange: (items: T[]) => void;
  render: (item: T, set: (v: T) => void) => ReactNode;
}) {
  const move = (i: number, d: number) => {
    const next = items.slice();
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      {title && <p className="text-sm font-semibold">{title}</p>}
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex-1">{render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}</div>
          <div className="flex shrink-0 flex-col gap-1">
            <button type="button" className={smallBtn} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Nach oben">
              ↑
            </button>
            <button type="button" className={smallBtn} disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Nach unten">
              ↓
            </button>
            <button type="button" className={smallBtn} onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Entfernen">
              ✕
            </button>
          </div>
        </div>
      ))}
      {items.length < max && (
        <button type="button" className={`${smallBtn} self-start`} onClick={() => onChange([...items, empty])}>
          + Hinzufügen
        </button>
      )}
    </div>
  );
}
