"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Notice } from "@/components/auth-ui";
import { splitGross } from "@/payments/types";
import { previewPriceAction, startCheckoutAction } from "./actions";

export type PublicationOfferProps = {
  enabled: boolean;
  discountPct: number;
  /** Trauer: ausdrückliche Beauftragung nötig (E15) */
  memorial: boolean;
  hasPhotos: boolean;
};

/**
 * Kaufformular (E16): Preis inkl. MwSt., zwei Pflicht-Haken (NICHT vorangekreuzt),
 * Button „Zahlungspflichtig bestellen“ (§ 312j BGB) – bei 0 € „Kostenlos bestellen“.
 * Freiwillig: Veröffentlichung (mit Rabatt), Gutschein- oder Affiliate-Code, Firmenrechnung.
 */
export function CheckoutForm({
  publicRef,
  baseGrossCents,
  currency,
  rateBp,
  publication,
}: {
  publicRef: string;
  baseGrossCents: number;
  currency: string;
  rateBp: number;
  publication: PublicationOfferProps;
}) {
  const t = useTranslations("Order");
  const id = useId();
  const [terms, setTerms] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const [business, setBusiness] = useState(false);
  const [code, setCode] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState(false);
  const [publish, setPublish] = useState(false);
  const [publishPhotos, setPublishPhotos] = useState(false);
  const [publishTitle, setPublishTitle] = useState(true);
  const [memorial, setMemorial] = useState(false);
  const [price, setPrice] = useState<{ lines: Array<{ label: string; cents: number }>; gross: number }>({
    lines: [],
    gross: baseGrossCents,
  });
  const euro = (cents: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
  const [billing, setBilling] = useState({
    company: "",
    contact: "",
    street: "",
    postalCode: "",
    city: "",
    vatId: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Preis neu berechnen (Code und/oder Veröffentlichung). */
  const recalc = (nextCode: string | null, nextPublish: boolean) =>
    startTransition(async () => {
      const r = await previewPriceAction(publicRef, nextCode ?? "", nextPublish);
      if (!r.ok) return;
      if (r.codeValid === false) {
        setCodeError(true);
        setAppliedCode(null);
        const again = await previewPriceAction(publicRef, "", nextPublish);
        if (again.ok) setPrice({ lines: again.lines, gross: again.grossCents });
        return;
      }
      setCodeError(false);
      setAppliedCode(r.codeValid ? (nextCode ?? "").trim().toUpperCase() : null);
      setPrice({ lines: r.lines, gross: r.grossCents });
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terms || !waiver) return setError(t("consentsMissing"));
    if (publish && publication.memorial && !memorial) return setError(t("errors.publication_invalid"));
    startTransition(async () => {
      const result = await startCheckoutAction(
        publicRef,
        { termsPrivacy: terms, withdrawalWaiver: waiver },
        business ? { ...billing, country: "Deutschland" } : null,
        appliedCode,
        publish
          ? {
              consent: true,
              photos: publication.hasPhotos && publishPhotos,
              title: publishTitle,
              memorial: publication.memorial && memorial,
            }
          : null,
      );
      if (result.ok) window.location.assign(result.checkoutUrl);
      else setError(t(`errors.${result.error}`));
    });
  };

  const checkbox = "mt-1 h-5 w-5 shrink-0 accent-brand-strong";
  const free = price.gross === 0;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <h2 className="text-xl font-bold">{t("checkoutTitle")}</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">{t("includes")}</p>
      <div>
        <p className="text-sm text-neutral-500">{t("priceLabel")}</p>
        <p className="text-3xl font-bold" data-testid="checkout-price">
          {euro(price.gross)}
        </p>
        {price.lines.length > 0 && (
          <ul className="text-sm text-green-700 dark:text-green-400" data-testid="price-lines">
            <li className="text-neutral-500 line-through">{euro(baseGrossCents)}</li>
            {price.lines.map((l) => (
              <li key={l.label}>
                {l.label}: {euro(l.cents)}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-neutral-500">
          {t("vatNote", {
            rate: (rateBp / 100).toLocaleString("de-DE"),
            tax: euro(splitGross(price.gross, rateBp).taxCents),
          })}
        </p>
      </div>

      {publication.enabled && (
        <fieldset
          className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
          data-testid="publication"
        >
          <legend className="px-1 text-sm font-semibold">{t("publishTitle")}</legend>
          <label htmlFor={`${id}-publish`} className="flex gap-3 text-sm">
            <input
              id={`${id}-publish`}
              type="checkbox"
              className={checkbox}
              checked={publish}
              onChange={(e) => {
                setPublish(e.target.checked);
                recalc(appliedCode, e.target.checked);
              }}
            />
            <span>
              {t("publishConsent")}{" "}
              {publication.discountPct > 0 && (
                <strong>{t("publishDiscount", { pct: publication.discountPct })}</strong>
              )}
            </span>
          </label>
          {publish && (
            <div className="ml-8 flex flex-col gap-3">
              {publication.memorial && (
                <label htmlFor={`${id}-memorial`} className="flex gap-3 text-sm">
                  <input
                    id={`${id}-memorial`}
                    type="checkbox"
                    className={checkbox}
                    checked={memorial}
                    onChange={(e) => setMemorial(e.target.checked)}
                  />
                  <span>{t("publishMemorial")}</span>
                </label>
              )}
              {publication.hasPhotos && (
                <label htmlFor={`${id}-photos`} className="flex gap-3 text-sm">
                  <input
                    id={`${id}-photos`}
                    type="checkbox"
                    className={checkbox}
                    checked={publishPhotos}
                    onChange={(e) => setPublishPhotos(e.target.checked)}
                  />
                  <span>{t("publishPhotos")}</span>
                </label>
              )}
              <label htmlFor={`${id}-title`} className="flex gap-3 text-sm">
                <input
                  id={`${id}-title`}
                  type="checkbox"
                  className={checkbox}
                  checked={publishTitle}
                  onChange={(e) => setPublishTitle(e.target.checked)}
                />
                <span>{t("publishTitleShown")}</span>
              </label>
              <p className="text-xs text-neutral-500">{t("publishHint")}</p>
            </div>
          )}
        </fieldset>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-voucher`} className="text-sm font-semibold">
          {t("voucherLabel")}
        </label>
        <div className="flex gap-2">
          <input
            id={`${id}-voucher`}
            value={code}
            autoCapitalize="characters"
            autoComplete="off"
            data-testid="voucher-code"
            onChange={(e) => {
              setCode(e.target.value);
              setCodeError(false);
            }}
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 uppercase dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="button"
            disabled={!code.trim() || pending}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-neutral-700"
            onClick={() => recalc(code, publish)}
          >
            {t("voucherApply")}
          </button>
        </div>
        {codeError && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {t("errors.voucher_invalid")}
          </p>
        )}
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
        {free ? t("submitFree") : t("submit")}
      </button>
    </form>
  );
}
