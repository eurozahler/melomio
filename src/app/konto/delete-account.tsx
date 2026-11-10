"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

/** „Konto löschen“ mit Rückfrage. Die eigentliche Arbeit macht die Server-Aktion. */
export function DeleteAccount({ action }: { action: () => Promise<{ error: string } | void> }) {
  const t = useTranslations("Account");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        data-testid="delete-account"
        className="self-start rounded-full border border-red-300 px-5 py-2 text-sm font-semibold text-red-700 disabled:opacity-60 dark:border-red-800 dark:text-red-300"
        onClick={() => {
          if (!window.confirm(t("deleteConfirm"))) return;
          start(async () => {
            const result = await action();
            if (result?.error) setError(result.error === "busy" ? t("deleteBusy") : t("deleteFailed"));
          });
        }}
      >
        {pending ? t("deleting") : t("delete")}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
