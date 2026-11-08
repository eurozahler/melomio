import { getTranslations } from "next-intl/server";

/** Platzhalter – die rechtlich geprüften Texte liefert der Auftraggeber (L14). */
export default async function Page() {
  const t = await getTranslations("Legal");
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-bold">{t("imprintTitle")}</h1>
      <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
        {t("placeholder")}
      </p>
    </main>
  );
}
