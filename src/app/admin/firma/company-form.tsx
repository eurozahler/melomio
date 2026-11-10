"use client";

import { useState, useTransition } from "react";
import type { CompanyProfile } from "@/invoices/company";
import type { AdminResult } from "../actions";

const FIELDS: Array<{ key: keyof CompanyProfile; label: string; hint?: string; wide?: boolean }> = [
  {
    key: "name",
    label: "Firmenname",
    hint: "genau wie im Handelsregister, z. B. „Muster UG (haftungsbeschränkt)“",
    wide: true,
  },
  { key: "street", label: "Straße und Hausnummer", wide: true },
  { key: "postalCode", label: "PLZ" },
  { key: "city", label: "Ort" },
  { key: "country", label: "Land" },
  { key: "managingDirector", label: "Geschäftsführer/in" },
  { key: "registerCourt", label: "Registergericht", hint: "z. B. Amtsgericht München" },
  { key: "registerNumber", label: "Registernummer", hint: "z. B. HRB 123456" },
  { key: "vatId", label: "USt-IdNr.", hint: "DE + 9 Ziffern – oder Steuernummer angeben" },
  { key: "taxNumber", label: "Steuernummer", hint: "falls keine USt-IdNr." },
  { key: "email", label: "E-Mail für Kunden" },
  { key: "phone", label: "Telefon", hint: "optional" },
  { key: "website", label: "Website", hint: "optional" },
];

export function CompanyForm({
  initial,
  save,
}: {
  initial: CompanyProfile;
  save: (values: CompanyProfile) => Promise<AdminResult>;
}) {
  const [values, setValues] = useState(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await save(values)));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label
            key={f.key}
            className={`flex flex-col gap-1 text-sm font-semibold ${f.wide ? "sm:col-span-2" : ""}`}
          >
            {f.label}
            <input
              value={values[f.key]}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              data-testid={`company-${f.key}`}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 font-normal dark:border-neutral-700 dark:bg-neutral-900"
            />
            {f.hint && <span className="text-xs font-normal text-neutral-500">{f.hint}</span>}
          </label>
        ))}
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
