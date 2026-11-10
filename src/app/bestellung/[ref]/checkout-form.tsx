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
  const [business, setBusiness] = useState(false);
  const [billing, setBilling] = useState({
    company: "",
    contact: "",
    street: "",
    postalCode: "",
    city: "",
    country: "Deutschland",
    vatId: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terms || !waiver) return setError(t("consentsMissing"));
    startTransition(async () => {
      const result = await startCheckoutAction(
        publicRef,
        { termsPrivacy: terms, withdrawalWaiver: waiver },
        business ? billing : null,
      );
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

      <label htmlFor={`${id}-business`} className="flex gap-3 text-sm">
        <input
          id={`${id}-business`}
          type="checkbox"
          className={checkbox}
          checked={business}
          onChange={(e) => setBusiness(e.target.checked)}
        />
        <span>{t("billingToggle")}</span>
      </label>
      {business && (
        <fieldset className="grid gap-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <legend className="px-1 text-sm font-semibold">{t("billingTitle")}</legend>
          {(
            [
              ["company", "billingCompany", "organization"],
              ["contact", "billingContact", "name"],
              ["street", "billingStreet", "street-address"],
              ["postalCode", "billingPostalCode", "postal-code"],
              ["city", "billingCity", "address-level2"],
              ["country", "billingCountry", "country-name"],
              ["vatId", "billingVatId", "off"],
            ] as const
          ).map(([key, label, autoComplete]) => (
            <label key={key} htmlFor={`${id}-${key}`} className="flex flex-col gap-1 text-sm">
              {t(label)}
              <input
                id={`${id}-${key}`}
                autoComplete={autoComplete}
                value={billing[key]}
                onChange={(e) => setBilling({ ...billing, [key]: e.target.value })}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
          ))}
        </fieldset>
      )}

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
