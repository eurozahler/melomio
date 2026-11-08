/**
 * Einwilligungstexte beim Kauf (E16). Jede Fassung hat eine Version; gespeichert wird, welche
 * Fassung der Kunde wann bestätigt hat (Tabelle consents).
 *
 * ⚠️ Der Wortlaut ist ein Entwurf und muss vor dem Livegang juristisch geprüft werden
 * (Widerrufsrecht bei digitalen Inhalten, § 356 Abs. 5 BGB). Bei Änderungen: neue Version!
 */
export const CONSENT_TEXTS = {
  terms_privacy: {
    version: "2026-11-08-entwurf",
    text: "Ich habe die AGB und die Datenschutzerklärung gelesen und akzeptiere sie.",
  },
  withdrawal_waiver: {
    version: "2026-11-08-entwurf",
    text: "Ich verlange ausdrücklich, dass melomio sofort mit der Ausführung beginnt, und weiß, dass ich dadurch mein Widerrufsrecht verliere.",
  },
} as const;

export type CheckoutConsentType = keyof typeof CONSENT_TEXTS;
