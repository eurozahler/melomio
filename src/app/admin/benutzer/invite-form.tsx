"use client";

import { useId, useState, useTransition } from "react";
import type { AdminResult } from "../actions";

const input =
  "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-normal dark:border-neutral-700 dark:bg-neutral-900";

/** Neuen Admin per E-Mail einladen (nur für Inhaber sichtbar). */
export function InviteForm({ invite }: { invite: (email: string, role: string) => Promise<AdminResult> }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const id = useId();
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
      onSubmit={(e) => {
        e.preventDefault();
        if (!window.confirm(`${email} als ${role === "owner" ? "Inhaber" : "Admin"} einladen?`)) return;
        start(async () => {
          const r = await invite(email, role);
          setResult(r);
          if (r.ok) setEmail("");
        });
      }}
    >
      <h2 className="font-bold">Neuen Admin einladen</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Die Person bekommt eine E-Mail und meldet sich mit dem E-Mail-Link an. Hat sie schon ein Konto,
        bekommt dieses die Rolle.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor={`${id}-email`} className="flex flex-col gap-1 text-sm font-semibold">
          E-Mail-Adresse
          <input
            id={`${id}-email`}
            type="email"
            required
            className={`${input} w-72 max-w-full`}
            value={email}
            data-testid="invite-email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label htmlFor={`${id}-role`} className="flex flex-col gap-1 text-sm font-semibold">
          Rolle
          <select id={`${id}-role`} className={input} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">Admin</option>
            <option value="owner">Inhaber</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-strong px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Einladen
        </button>
      </div>
      {result && (
        <p role="status" className={`text-sm ${result.ok ? "text-green-700" : "text-red-700"}`}>
          {result.ok ? result.message : result.error}
        </p>
      )}
    </form>
  );
}
