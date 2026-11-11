"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { withdrawPublicationAction } from "./actions";

/** Stand der freiwilligen Veröffentlichung mit Widerruf (jederzeit möglich). */
export function PublicationStatus({ publicRef, status }: { publicRef: string; status: string }) {
  const t = useTranslations("Order");
  const [pending, start] = useTransition();
  return (
    <section
      className="flex flex-col gap-2 rounded-2xl border border-neutral-200 p-5 text-sm dark:border-neutral-800"
      data-testid="publication-status"
    >
      <h2 className="text-lg font-bold">{t("publishTitle")}</h2>
      <p>{t(`publicationStatus.${status}`)}</p>
      {status !== "withdrawn" && status !== "rejected" && (
        <button
          type="button"
          disabled={pending}
          className="self-start rounded-full border border-neutral-300 px-4 py-2 font-semibold disabled:opacity-60 dark:border-neutral-700"
          onClick={() => {
            if (!window.confirm(t("publicationWithdrawConfirm"))) return;
            start(async () => {
              await withdrawPublicationAction(publicRef);
            });
          }}
        >
          {t("publicationWithdraw")}
        </button>
      )}
    </section>
  );
}
