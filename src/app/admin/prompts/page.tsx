import { Suspense } from "react";
import { LYRICS_MODELS, listPromptVersions } from "@/admin/prompts";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { LYRICS_DEFAULT_MODEL, LYRICS_SYSTEM_PROMPT_V1 } from "@/lyrics/prompts";
import { requireAdmin } from "@/server/admin";
import { ActionButton } from "../admin-ui";
import { activatePromptAction, savePromptAction, testPromptAction } from "./actions";
import { PromptEditor } from "./prompt-ui";

export default function AdminPrompts() {
  return (
    <Suspense fallback={null}>
      <Prompts />
    </Suspense>
  );
}

async function Prompts() {
  await requireAdmin("/admin/prompts");
  const versions = await listPromptVersions(getDb());
  const active = versions.find((v) => v.active) ?? null;
  const date = (d: Date) =>
    d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Songtext-Prompt</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Diese Anweisungen bekommt die KI für jeden Songtext. Änderungen werden als neue Fassung gespeichert
          und erst nach „Aktivieren“ verwendet. Mit einer älteren Fassung kannst du jederzeit zurückgehen.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-xl font-bold">
          {active ? `Aktive Fassung ${active.version}` : "Eingebaute Fassung 1 (Standard)"}
        </h2>
        <PromptEditor
          key={active?.id ?? "builtin"}
          initial={{
            template: active?.template ?? LYRICS_SYSTEM_PROMPT_V1,
            model: active?.model ?? LYRICS_DEFAULT_MODEL,
          }}
          models={LYRICS_MODELS}
          providerName={getEnv().LYRICS_PROVIDER}
          save={savePromptAction}
          test={testPromptAction}
        />
      </section>

      <section>
        <h2 className="mb-2 text-xl font-bold">Alle Fassungen</h2>
        {versions.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Noch keine gespeicherten Fassungen – es gilt die eingebaute.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="prompt-versions">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800"
              >
                <span>
                  <strong>Fassung {v.version}</strong> · {v.model} · {date(v.createdAt)}
                  {v.active && (
                    <span className="ml-2 rounded bg-green-100 px-1.5 text-xs text-green-900">aktiv</span>
                  )}
                </span>
                {!v.active && (
                  <ActionButton
                    label="Aktivieren"
                    variant="secondary"
                    action={activatePromptAction.bind(null, v.id)}
                    confirmText={`Fassung ${v.version} aktivieren? Sie gilt sofort für neue Songtexte.`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
