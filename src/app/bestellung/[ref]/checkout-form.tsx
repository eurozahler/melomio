"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Notice } from "@/components/auth-ui";
import { startCheckoutAction } from "./actions";

/**
 * Kaufformular (E16): Preis inkl. MwSt., zwei Pflicht-Haken (NICHT vorangekreuzt),
 * Button „Zahlungspflichtig bestellen“ (§ 312j BGB).
 */
export function CheckoutForm({
  publicRef,
  grossLabel,
  vatLabel,
}: {
  publicRef: string;
  grossLabel: string;
  vatLabel: string;
}) {
  const t = useTranslations("Order");
  const id = useId();
  const [terms, setTerms] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terms || !waiver) return setError(t("consentsMissing"));
    startTransition(async () => {
      const result = await startCheckoutAction(publicRef, { termsPrivacy: terms, withdrawalWaiver: waiver });
      if (result.ok) window.location.assign(result.checkoutUrl);
      else setError(t(`errors.${result.error}`));
    });
  };

  const checkbox = "mt-1 h-5 w-5 shrink-0 accent-brand-strong";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <h2 className="text-xl font-bold">{t("checkoutTitle")}</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">{t("includes")}</p>
      <div>
        <p className="text-sm text-neutral-500">{t("priceLabel")}</p>
        <p className="text-3xl font-bold" data-testid="checkout-price">
          {grossLabel}
        </p>
        <p className="text-sm text-neutral-500">{vatLabel}</p>
      </div>

      <label htmlFor={`${id}-terms`} className="flex gap-3 text-sm">
        <input
          id={`${id}-terms`}
          type="checkbox"
          className={checkbox}
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
        />
        <span>
          {t.rich("consentTerms", {
            agb: (chunks) => (
              <Link href="/agb" target="_blank" className="font-semibold text-brand underline">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/datenschutz" target="_blank" className="font-semibold text-brand underline">
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>
      <label htmlFor={`${id}-waiver`} className="flex gap-3 text-sm">
        <input
          id={`${id}-waiver`}
          type="checkbox"
          className={checkbox}
          checked={waiver}
          onChange={(e) => setWaiver(e.target.checked)}
        />
        <span>{t("consentWaiver")}</span>
      </label>

      {error && <Notice kind="error">{error}</Notice>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-brand-strong px-6 py-3 font-semibold text-white hover:bg-brand-strong-hover disabled:opacity-60"
      >
        {t("submit")}
      </button>
    </form>
  );
}
