"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { disableShareAction, enableShareAction } from "./actions";

/** Song-Seite ein-/ausschalten, Link kopieren, QR-Code anzeigen (E17). */
export function ShareControls({
  publicRef,
  shareUrl,
  qrSvg,
}: {
  publicRef: string;
  shareUrl: string | null;
  qrSvg: string | null;
}) {
  const t = useTranslations("Order");
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const button = "rounded-full px-5 py-3 font-semibold disabled:opacity-60";

  return (
    <div className="flex flex-col gap-3" data-testid="share-controls">
      <h2 className="text-xl font-bold">{t("shareTitle")}</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">{t("shareText")}</p>
      {shareUrl ? (
        <>
          <p className="text-sm font-semibold">{t("shareActive")}</p>
          <a
            href={shareUrl}
            className="font-mono text-sm break-all text-brand underline"
            data-testid="share-url"
          >
            {shareUrl}
          </a>
          {qrSvg && (
            <div
              role="img"
              aria-label={t("qrAlt")}
              className="w-44 self-center rounded-xl bg-white p-2"
              // QR-Code als SVG – selbst erzeugt aus unserer eigenen Adresse
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${button} border border-neutral-300 dark:border-neutral-700`}
              onClick={async () => {
                await navigator.clipboard?.writeText(shareUrl);
                setCopied(true);
              }}
            >
              {copied ? t("shareCopied") : t("shareCopy")}
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${button} border border-neutral-300 dark:border-neutral-700`}
              onClick={() => startTransition(() => disableShareAction(publicRef))}
            >
              {t("shareDisable")}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={pending}
          className={`${button} bg-brand-strong text-white hover:bg-brand-strong-hover`}
          onClick={() => startTransition(() => enableShareAction(publicRef))}
        >
          {t("shareEnable")}
        </button>
      )}
    </div>
  );
}
