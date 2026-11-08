import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("Home");
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <p className="text-sm font-semibold tracking-[0.3em] text-rose-600 uppercase">melomio</p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t("headline")}</h1>
      <p className="text-lg text-neutral-600 dark:text-neutral-300">{t("subline")}</p>
      <button
        type="button"
        disabled
        className="rounded-full bg-rose-600 px-8 py-3 text-base font-semibold text-white opacity-60"
      >
        {t("cta")}
      </button>
      <p className="text-xs text-neutral-500">{t("comingSoon")}</p>
    </main>
  );
}
