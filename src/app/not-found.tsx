import Link from "next/link";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("NotFound");
  const tc = useTranslations("Common");
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="text-neutral-600 dark:text-neutral-300">{t("text")}</p>
      <Link href="/" className="rounded-full bg-brand-strong px-6 py-3 font-semibold text-white">
        {tc("home")}
      </Link>
    </main>
  );
}
