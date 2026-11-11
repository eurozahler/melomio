"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { Notice } from "@/components/auth-ui";
import {
  applyAction,
  createCodeAction,
  toggleCodeAction,
  updateDataAction,
  type PartnerResult,
} from "./actions";

export type PartnerData = {
  fullName: string;
  company: string;
  street: string;
  postalCode: string;
  city: string;
  channels: string;
  accountHolder: string;
  iban: string;
  taxStatus: "private" | "small_business" | "vat_registered";
  vatId: string;
  taxNumber: string;
};

const EMPTY: PartnerData = {
  fullName: "",
  company: "",
  street: "",
  postalCode: "",
  city: "",
  channels: "",
  accountHolder: "",
  iban: "",
  taxStatus: "private",
  vatId: "",
  taxNumber: "",
};

const input =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900";

function Result({ result }: { result: PartnerResult | null }) {
  if (!result) return null;
  return <Notice kind={result.ok ? "success" : "error"}>{result.ok ? result.message : result.error}</Notice>;
}

/** Bewerbung bzw. Ändern der Partnerdaten. */
export function PartnerForm({ initial, mode }: { initial: PartnerData | null; mode: "apply" | "update" }) {
  const id = useId();
  const [values, setValues] = useState<PartnerData>(initial ?? EMPTY);
  const [terms, setTerms] = useState(mode === "update");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PartnerResult | null>(null);
  const field = (
    key: keyof PartnerData,
    label: string,
    opts: { autoComplete?: string; hint?: string } = {},
  ) => (
    <label htmlFor={`${id}-${key}`} className="flex flex-col gap-1 text-sm font-semibold">
      {label}
      <input
        id={`${id}-${key}`}
        className={`${input} font-normal`}
        autoComplete={opts.autoComplete ?? "off"}
        value={values[key]}
        onChange={(e) => setValues({ ...values, [key]: e.target.value })}
      />
      {opts.hint && <span className="text-xs font-normal text-neutral-500">{opts.hint}</span>}
    </label>
  );
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="partner-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () =>
          setResult(
            await (mode === "apply" ? applyAction : updateDataAction)({ ...values, termsAccepted: terms }),
          ),
        );
      }}
    >
      {field("fullName", "Vor- und Nachname", { autoComplete: "name" })}
      {field("company", "Firma (optional)", { autoComplete: "organization" })}
      {field("street", "Straße und Hausnummer", { autoComplete: "street-address" })}
      <div className="grid grid-cols-3 gap-2">
        {field("postalCode", "PLZ", { autoComplete: "postal-code" })}
        <div className="col-span-2">{field("city", "Ort", { autoComplete: "address-level2" })}</div>
      </div>
      <label htmlFor={`${id}-channels`} className="flex flex-col gap-1 text-sm font-semibold">
        Wo möchtest du melomio empfehlen?
        <textarea
          id={`${id}-channels`}
          rows={3}
          className={`${input} font-normal`}
          value={values.channels}
          placeholder="z. B. Instagram @meinkanal (5.000 Follower), Hochzeitsblog, Kundenkreis …"
          onChange={(e) => setValues({ ...values, channels: e.target.value })}
        />
      </label>
      {field("accountHolder", "Kontoinhaber", { autoComplete: "name" })}
      {field("iban", "IBAN", { hint: "Für die Auszahlung deiner Provision." })}
      <label htmlFor={`${id}-tax`} className="flex flex-col gap-1 text-sm font-semibold">
        Steuerliche Stellung
        <select
          id={`${id}-tax`}
          className={`${input} font-normal`}
          value={values.taxStatus}
          onChange={(e) => setValues({ ...values, taxStatus: e.target.value as PartnerData["taxStatus"] })}
        >
          <option value="private">Privatperson (nicht unternehmerisch)</option>
          <option value="small_business">Kleinunternehmer (§ 19 UStG, ohne Umsatzsteuer)</option>
          <option value="vat_registered">Unternehmer mit Umsatzsteuer (19 %)</option>
        </select>
      </label>
      {values.taxStatus !== "private" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {field("taxNumber", "Steuernummer")}
          {field("vatId", "USt-IdNr. (falls vorhanden)")}
        </div>
      )}
      {mode === "apply" && (
        <label htmlFor={`${id}-terms`} className="flex gap-3 text-sm">
          <input
            id={`${id}-terms`}
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-brand-strong"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
          />
          <span>
            Ich habe die{" "}
            <Link href="/partnerbedingungen" target="_blank" className="font-semibold text-brand underline">
              Partnerbedingungen
            </Link>{" "}
            gelesen und akzeptiere sie.
          </span>
        </label>
      )}
      <Result result={result} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-strong px-6 py-3 font-semibold text-white hover:bg-brand-strong-hover disabled:opacity-60"
      >
        {mode === "apply" ? "Bewerbung absenden" : "Daten speichern"}
      </button>
    </form>
  );
}

/** Neuen Code erzeugen (Wunschcode oder automatisch). */
export function NewCode() {
  const id = useId();
  const [wanted, setWanted] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PartnerResult | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createCodeAction(wanted);
          setResult(r);
          if (r.ok) setWanted("");
        });
      }}
    >
      <label htmlFor={`${id}-code`} className="text-sm font-semibold">
        Wunschcode (optional, sonst automatisch)
      </label>
      <div className="flex gap-2">
        <input
          id={`${id}-code`}
          className={`${input} min-w-0 flex-1 uppercase`}
          value={wanted}
          placeholder="z. B. ANNA10"
          data-testid="new-code"
          onChange={(e) => setWanted(e.target.value)}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-strong px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Code erstellen
        </button>
      </div>
      <Result result={result} />
    </form>
  );
}

export function CodeToggle({ codeId, active }: { codeId: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-semibold disabled:opacity-60 dark:border-neutral-700"
      onClick={() => start(async () => void (await toggleCodeAction(codeId, !active)))}
    >
      {active ? "Deaktivieren" : "Aktivieren"}
    </button>
  );
}
