import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import icon from "./icon.png";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getActiveOccasions, getSongPrice } from "@/server/catalog";
import { TrackedLink } from "@/components/tracked-link";
import { getDb } from "@/db/client";
import { listPublishedLandings } from "@/marketing/landing";

export default function HomePage() {
  const t = useTranslations("Home");
  const stepKeys = ["tell", "lyrics", "preview", "receive"] as const;
  const faqKeys = ["ai", "preview", "data"] as const;

  return (
    <>
      <main className="flex-1">
        {/* Einstieg */}
        <section className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 pt-16 pb-12 text-center">
          <Image src={icon} alt="" priority className="h-20 w-20" sizes="80px" />
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t("headline")}</h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-300">{t("subline")}</p>
          <a
            href="#anlaesse"
            className="rounded-full bg-brand-strong px-8 py-3 text-base font-semibold text-white hover:bg-brand-strong-hover"
          >
            {t("cta")}
          </a>
        </section>

        {/* So funktioniert's */}
        <section className="mx-auto max-w-3xl px-4 py-10" aria-labelledby="how">
          <h2 id="how" className="mb-6 text-center text-2xl font-bold">
            {t("howTitle")}
          </h2>
          <ol className="grid gap-4 sm:grid-cols-4">
            {stepKeys.map((key, i) => (
              <li key={key} className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-strong text-sm font-bold text-white">
                  {i + 1}
                </span>
                <p className="mt-3 font-semibold">{t(`steps.${key}.title`)}</p>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                  {t(`steps.${key}.text`)}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Anlässe und Preis (aus der Datenbank, erst beim Aufruf geladen) */}
        <section id="anlaesse" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-10" aria-labelledby="occ">
          <h2 id="occ" className="mb-6 text-center text-2xl font-bold">
            {t("occasionsTitle")}
          </h2>
          <Suspense fallback={<OccasionsSkeleton />}>
            <OccasionsAndPrice />
          </Suspense>
        </section>

        {/* Häufige Fragen */}
        <section className="mx-auto max-w-xl px-4 py-10" aria-labelledby="faq">
          <h2 id="faq" className="mb-4 text-center text-2xl font-bold">
            {t("faqTitle")}
          </h2>
          <div className="flex flex-col gap-3">
            {faqKeys.map((key) => (
              <details
                key={key}
                className="rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800"
              >
                <summary className="cursor-pointer font-semibold">{t(`faq.${key}.q`)}</summary>
                <p className="mt-2 text-neutral-600 dark:text-neutral-300">{t(`faq.${key}.a`)}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

async function OccasionsAndPrice() {
  await connection();
  const t = await getTranslations("Home");
  const [occasions, price, landings] = await Promise.all([
    getActiveOccasions(),
    getSongPrice(),
    listPublishedLandings(getDb()).catch(() => []),
  ]);
  const formatted = price
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: price.currency }).format(
        price.grossCents / 100,
      )
    : null;

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-3">
        {occasions.map((o) => (
          <li key={o.slug}>
            <TrackedLink
              href={`/song/${o.slug}`}
              className="flex h-full flex-col rounded-2xl border border-neutral-200 p-5 transition hover:border-brand/50 hover:shadow-md dark:border-neutral-800"
            >
              <span className="text-lg font-bold">{o.name}</span>
              {o.description && (
                <span className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{o.description}</span>
              )}
              <span className="mt-4 text-sm font-semibold text-brand">{t("cta")} →</span>
            </TrackedLink>
          </li>
        ))}
      </ul>
      {landings.length > 0 && (
        <nav aria-label="Mehr zu den Anlässen" className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-300">
          Mehr erfahren:{" "}
          {landings.map((l, i) => (
            <span key={l.slug}>
              {i > 0 && " · "}
              <Link href={`/lieder/${l.slug}`} className="underline hover:text-brand">
                {l.occasionName}
              </Link>
            </span>
          ))}
        </nav>
      )}
      {formatted && (
        <p className="mt-8 text-center">
          <span className="text-sm text-neutral-500">{t("priceLabel")}</span>
          <br />
          <span className="text-3xl font-bold" data-testid="price">
            {formatted}
          </span>
          <br />
          <span className="text-sm text-neutral-500">{t("priceNote")}</span>
        </p>
      )}
    </>
  );
}

function OccasionsSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 sm:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
      ))}
    </div>
  );
}
