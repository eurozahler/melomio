"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Notice } from "@/components/auth-ui";
import { chooseVersionAction } from "./actions";

/** Zwei Versionen anhören und den Favoriten wählen (zweite Song-Version nach dem Kauf). */
export function VersionChooser({
  publicRef,
  versions,
  days,
}: {
  publicRef: string;
  versions: Array<{ candidateId: string; label: 1 | 2 }>;
  days: number;
}) {
  const t = useTranslations("Order");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-brand/40 p-5"
      aria-labelledby="versions"
      data-testid="version-chooser"
    >
      <div>
        <h2 id="versions" className="text-2xl font-bold">
          {t("versionsTitle")}
        </h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t("versionsText", { days })}</p>
      </div>
      {versions.map((v) => (
        <div
          key={v.candidateId}
          className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900"
        >
          <p className="font-semibold">{t(v.label === 1 ? "versionPreview" : "versionNew")}</p>
          <audio
            controls
            preload="metadata"
            controlsList="nodownload"
            className="w-full"
            src={`/api/version/${publicRef}/${v.label}`}
            data-testid={`version-audio-${v.label}`}
          />
          <button
            type="button"
            disabled={pending}
            className="rounded-full bg-brand-strong px-5 py-2.5 font-semibold text-white hover:bg-brand-strong-hover disabled:opacity-60"
            onClick={() =>
              startTransition(async () => {
                const r = await chooseVersionAction(publicRef, v.candidateId);
                setError(!r.ok);
              })
            }
          >
            {t("versionChoose", { n: v.label })}
          </button>
        </div>
      ))}
      {error && <Notice kind="error">{t("versionError")}</Notice>}
    </section>
  );
}
