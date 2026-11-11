import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TrackedLink } from "@/components/tracked-link";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { getLandingBySlug } from "@/marketing/landing";
import { getAdminUser } from "@/server/admin";
import { getSongPrice } from "@/server/catalog";
import icon from "../../icon.png";

/**
 * Landingpage je Anlass (/lieder/<slug>) – für Google-Suche und Google Ads.
 * Texte aus dem Admin (Marketing → Landingpages). Varianten für Kampagnen über ?k=<kürzel>.
 * Unveröffentlichte Seiten sieht nur ein Admin (Vorschau, nicht indexiert).
 */

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function load(slug: string) {
  const db = getDb();
  const page = await getLandingBySlug(db, slug);
  if (page) return { page, preview: false };
  const admin = await getAdminUser();
  if (!admin) return null;
  const draft = await getLandingBySlug(db, slug, true);
  return draft ? { page: draft, preview: true } : null;
}

export async function generateMetadata({ params }: PageProps<"/lieder/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLandingBySlug(getDb(), slug);
  if (!page) return { title: "melomio", robots: { index: false, follow: false } };
  const url = `${getEnv().APP_BASE_URL}/lieder/${page.slug}`;
  return {
    title: { absolute: page.metaTitle },
    description: page.metaDescription,
    // Kampagnen-Varianten (?k=…) und Werbe-Parameter zeigen auf dieselbe Seite
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: page.metaTitle,
      description: page.metaDescription,
      siteName: "melomio",
      locale: "de_DE",
    },
  };
}

export default function LandingPage({ params, searchParams }: PageProps<"/lieder/[slug]">) {
  return (
    <main className="flex-1">
      <Suspense fallback={<HeroSkeleton />}>
        <Landing params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Landing({ params, searchParams }: Pick<PageProps<"/lieder/[slug]">, "params" | "searchParams">) {
  const { slug } = await params;
  const query = await searchParams;
  const loaded = await load(slug);
  if (!loaded) notFound();
  const { page, preview } = loaded;
  const [price, t] = await Promise.all([getSongPrice(), getTranslations("Home")]);
  const env = getEnv();

  const variantKey = one(query.k).toLowerCase();
  const variant = page.variants.find((v) => v.key === variantKey);
  const h1 = variant?.h1 || page.h1;
  const intro = variant?.intro || page.intro;
  const cta = page.ctaLabel || t("cta");
  const href = `/song/${page.occasionSlug}`;
  const extra = { lp: page.slug, k: variant?.key };
  const priceText = price
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: price.currency }).format(price.grossCents / 100)
    : null;
  const url = `${env.APP_BASE_URL}/lieder/${page.slug}`;
  const stepKeys = ["tell", "lyrics", "preview", "receive"] as const;

  // Strukturierte Daten für Google (Produkt mit Preis, häufige Fragen, Brotkrumen)
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: `Persönlicher Song – ${page.occasionName}`,
      description: page.metaDescription,
      brand: { "@type": "Brand", name: "melomio" },
      url,
      ...(price && {
        offers: {
          "@type": "Offer",
          price: (price.grossCents / 100).toFixed(2),
          priceCurrency: price.currency,
          availability: "https://schema.org/InStock",
          url,
        },
      }),
    },
    page.faqs.length > 0 && {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "melomio", item: `${env.APP_BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: page.occasionName, item: url },
      ],
    },
  ].filter(Boolean);

  const ctaClass =
    "inline-flex items-center justify-center rounded-full bg-brand-strong px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-strong-hover";

  return (
    <>
      {preview && (
        <>
          <meta name="robots" content="noindex, nofollow" />
          <p className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
            Vorschau – diese Seite ist noch nicht veröffentlicht und nur für Admins sichtbar.
          </p>
        </>
      )}
      {!preview && (
        <script
          type="application/ld+json"
          // JSON.stringify mit Escape von "<" – verhindert, dass Texte das Script-Tag beenden
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      )}

      {/* Einstieg */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="bg-brand-gradient absolute inset-x-0 top-0 h-72 opacity-10 blur-3xl" />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 pt-14 pb-12 text-center">
          <Image src={icon} alt="" priority className="h-16 w-16" sizes="64px" />
          <p className="text-xs font-bold tracking-widest text-brand uppercase">{page.occasionName}</p>
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl" data-testid="landing-h1">
            {h1}
          </h1>
          <p className="text-lg text-pretty text-neutral-600 dark:text-neutral-300">{intro}</p>
          <TrackedLink href={href} extra={extra} className={ctaClass} testId="landing-cta">
            {cta}
          </TrackedLink>
          <p className="text-sm text-neutral-500">
            Kostenlose Hörprobe vor dem Kauf{priceText && ` · Song mit Video ${priceText} inkl. MwSt.`}
          </p>
          {page.highlights.length > 0 && (
            <ul className="mt-2 grid w-full gap-2 text-left sm:grid-cols-2">
              {page.highlights.map((h) => (
                <li
                  key={h}
                  className="flex items-start gap-2 rounded-xl border border-neutral-200 bg-white/70 px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/70"
                >
                  <span aria-hidden className="mt-0.5 font-bold text-brand">
                    ✓
                  </span>
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Hörbeispiel */}
      {page.sampleAudioKey && (
        <section className="mx-auto max-w-xl px-4 py-8" aria-labelledby="sample">
          <div className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
            <h2 id="sample" className="text-lg font-bold">
              Hörbeispiel{page.sampleTitle && `: ${page.sampleTitle}`}
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
              So klingt ein Song von melomio. Deiner entsteht aus deinen eigenen Geschichten.
            </p>
            <audio
              className="mt-4 w-full"
              controls
              preload="none"
              src={`/api/hoerbeispiel/${page.slug}`}
              data-testid="landing-sample"
            />
          </div>
        </section>
      )}

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
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t(`steps.${key}.text`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Inhaltsabschnitte */}
      {page.sections.length > 0 && (
        <section className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
          {page.sections.map((s) => (
            <article key={s.heading}>
              <h2 className="text-2xl font-bold tracking-tight">{s.heading}</h2>
              {s.body.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="mt-3 text-pretty whitespace-pre-line text-neutral-700 dark:text-neutral-300">
                  {para}
                </p>
              ))}
            </article>
          ))}
        </section>
      )}

      {/* Häufige Fragen */}
      {page.faqs.length > 0 && (
        <section className="mx-auto max-w-2xl px-4 py-10" aria-labelledby="faq">
          <h2 id="faq" className="mb-4 text-center text-2xl font-bold">
            {t("faqTitle")}
          </h2>
          <div className="flex flex-col gap-3">
            {page.faqs.map((f) => (
              <details key={f.q} className="rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800">
                <summary className="cursor-pointer font-semibold">{f.q}</summary>
                <p className="mt-2 text-neutral-600 dark:text-neutral-300">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Abschluss */}
      <section className="mx-auto max-w-2xl px-4 pt-6 pb-16">
        <div className="bg-brand-gradient rounded-3xl p-8 text-center text-white">
          <h2 className="text-2xl font-bold">Bereit für deinen Song?</h2>
          <p className="mt-2 text-white/90">In wenigen Minuten erzählt – vor dem Kauf kostenlos reinhören.</p>
          <TrackedLink
            href={href}
            extra={extra}
            className="mt-6 inline-flex rounded-full bg-white px-8 py-3 font-semibold text-brand-strong shadow-lg"
          >
            {cta}
          </TrackedLink>
        </div>
      </section>
    </>
  );
}

function HeroSkeleton() {
  return (
    <div className="mx-auto flex max-w-2xl animate-pulse flex-col items-center gap-6 px-4 pt-14" aria-hidden>
      <div className="h-16 w-16 rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-10 w-3/4 rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-5 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-12 w-56 rounded-full bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}
