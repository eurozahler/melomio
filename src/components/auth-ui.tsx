import { useId, type InputHTMLAttributes, type ReactNode } from "react";

/** Gemeinsame Bausteine für die Anmeldeseiten: Rahmen, Eingabefeld, Hinweise. */

export function AuthCard({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {intro && <p className="mt-2 text-neutral-600 dark:text-neutral-300">{intro}</p>}
      <div className="mt-6 flex flex-col gap-5">{children}</div>
    </main>
  );
}

/**
 * Eingabefeld mit Beschriftung. Die Kennung wird eindeutig erzeugt: Next.js hält beim Seitenwechsel
 * die vorherige Seite unsichtbar vor – feste Kennungen wie "email" gäbe es sonst doppelt, und die
 * Beschriftung würde auf das unsichtbare Feld zeigen.
 */
export function TextField({
  id: name,
  label,
  hint,
  ...input
}: { id: string; label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `${name}-${useId()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-semibold">
        {label}
      </label>
      <input
        id={id}
        className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base shadow-sm focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
        name={name}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-neutral-500">
          {hint}
        </p>
      )}
    </div>
  );
}

export function PrimaryButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full rounded-full bg-brand-strong px-6 py-3 font-semibold text-white hover:bg-brand-strong-hover disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function Notice({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200",
    success: "border-green-300 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200",
    info: "border-neutral-300 bg-neutral-50 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 ${styles}`}>
      {children}
    </div>
  );
}
