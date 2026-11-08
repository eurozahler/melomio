import { getRequestConfig } from "next-intl/server";

/**
 * Sprache der Oberfläche. Vorerst nur Deutsch (Entscheidung E4).
 * Englisch kommt in Phase D über eine Sprachweiche dazu, ohne die Texte umzubauen.
 */
export const DEFAULT_LOCALE = "de";

export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
