/**
 * E-Mail-Vorlagen (Deutsch). Jede Vorlage liefert Betreff, Text- und HTML-Fassung.
 * Die Textfassung ist für E-Mail-Programme ohne HTML und für das Test-Postfach.
 */

type Rendered = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(
  title: string,
  paragraphs: string[],
  button: { label: string; url: string },
  footer: string,
): string {
  const p = paragraphs.map((t) => `<p style="margin:0 0 16px">${escapeHtml(t)}</p>`).join("");
  return `<!doctype html><html lang="de"><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#171717">
<div style="max-width:520px;margin:0 auto;padding:24px">
<p style="color:#9b2fb4;font-weight:bold;letter-spacing:4px;text-transform:uppercase;font-size:12px">melomio</p>
<div style="background:#fff;border-radius:16px;padding:24px">
<h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>${p}
<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#9b2fb4;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold;display:inline-block">${escapeHtml(button.label)}</a></p>
<p style="font-size:12px;color:#737373;word-break:break-all">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>${escapeHtml(button.url)}</p>
</div>
<p style="font-size:12px;color:#737373;margin-top:16px">${escapeHtml(footer)}</p>
</div></body></html>`;
}

const IGNORE = "Wenn du das nicht angefordert hast, kannst du diese E-Mail einfach ignorieren.";

function greeting(name: string | null | undefined) {
  return name?.trim() ? `Hallo ${name.trim()},` : "Hallo,";
}

export function verifyEmailTemplate(p: { name?: string | null; url: string }): Rendered {
  const subject = "Bitte bestätige deine E-Mail-Adresse";
  const lines = [
    greeting(p.name),
    "schön, dass du dabei bist! Bitte bestätige deine E-Mail-Adresse – danach geht es direkt mit deinem Song weiter.",
    "Der Link ist 24 Stunden gültig.",
  ];
  return {
    subject,
    text: `${lines.join("\n\n")}\n\nE-Mail bestätigen: ${p.url}\n\n${IGNORE}`,
    html: layout(subject, lines, { label: "E-Mail bestätigen", url: p.url }, IGNORE),
  };
}

export function magicLinkTemplate(p: { url: string }): Rendered {
  const subject = "Dein Anmeldelink für melomio";
  const lines = [
    "Hallo,",
    "mit diesem Link meldest du dich ohne Passwort an.",
    "Der Link ist 15 Minuten gültig und funktioniert nur einmal.",
  ];
  return {
    subject,
    text: `${lines.join("\n\n")}\n\nJetzt anmelden: ${p.url}\n\n${IGNORE}`,
    html: layout(subject, lines, { label: "Jetzt anmelden", url: p.url }, IGNORE),
  };
}

export function resetPasswordTemplate(p: { name?: string | null; url: string }): Rendered {
  const subject = "Neues Passwort für melomio";
  const lines = [
    greeting(p.name),
    "du hast ein neues Passwort angefordert. Über den folgenden Link kannst du es festlegen.",
    "Der Link ist 1 Stunde gültig.",
  ];
  return {
    subject,
    text: `${lines.join("\n\n")}\n\nNeues Passwort festlegen: ${p.url}\n\n${IGNORE}`,
    html: layout(subject, lines, { label: "Neues Passwort festlegen", url: p.url }, IGNORE),
  };
}

export type OrderConfirmationData = {
  name?: string | null;
  publicRef: string;
  productName: string;
  grossCents: number;
  taxCents: number;
  taxRateBp: number;
  currency: string;
  paidAt: Date;
  orderUrl: string;
  consents: Array<{ text: string; version: string; grantedAt: Date }>;
  isTest: boolean;
  /** Nummer der angehängten Rechnung (PDF). */
  invoiceNumber?: string | null;
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
const dateTime = (d: Date) =>
  d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "long", timeStyle: "short" });

/**
 * Bestellbestätigung (E16): Vertragsinhalt und bestätigte Einwilligungen – insbesondere der
 * Verzicht auf das Widerrufsrecht – auf einem dauerhaften Datenträger. ⚠️ Wortlaut juristisch prüfen.
 */
export function orderConfirmationTemplate(p: OrderConfirmationData): Rendered {
  const subject = `${p.isTest ? "[TEST] " : ""}Deine Bestellung ${p.publicRef} bei melomio`;
  const lines = [
    greeting(p.name),
    "vielen Dank für deine Bestellung! Deine Zahlung ist eingegangen. Wir erstellen jetzt deinen Song mit Video.",
    `Bestellnummer: ${p.publicRef}`,
    `Produkt: ${p.productName}`,
    `Preis: ${money(p.grossCents, p.currency)} (darin enthalten ${(p.taxRateBp / 100).toLocaleString("de-DE")} % MwSt.: ${money(p.taxCents, p.currency)})`,
    `Bezahlt am: ${dateTime(p.paidAt)}`,
    ...(p.invoiceNumber
      ? [`Deine Rechnung ${p.invoiceNumber} findest du im Anhang (PDF) und jederzeit in deinem Konto.`]
      : []),
    "Du hast beim Kauf Folgendes bestätigt:",
    ...p.consents.map((c) => `„${c.text}“ (bestätigt am ${dateTime(c.grantedAt)}, Fassung ${c.version})`),
    ...(p.isTest ? ["TESTBETRIEB: Es wurde kein echtes Geld bezahlt."] : []),
  ];
  const footer = "Diese E-Mail ist deine Bestellbestätigung. Bitte bewahre sie auf.";
  return {
    subject,
    text: `${lines.join("\n\n")}\n\nZu deiner Bestellung: ${p.orderUrl}\n\n${footer}`,
    html: layout(subject, lines, { label: "Zu deiner Bestellung", url: p.orderUrl }, footer),
  };
}

/** „Dein Song ist fertig“ (M9): Link führt zur Bestellung – Anmeldung nötig, keine Datei direkt in der E-Mail. */
export function songReadyTemplate(p: {
  name?: string | null;
  publicRef: string;
  orderUrl: string;
  isTest: boolean;
}): Rendered {
  const subject = `${p.isTest ? "[TEST] " : ""}Dein Song ist fertig! 🎉`;
  const lines = [
    greeting(p.name),
    "dein persönlicher Song und dein Video sind fertig.",
    "Über den Button kommst du zu deiner Bestellung. Dort kannst du alles anhören, herunterladen und eine Song-Seite zum Teilen einschalten.",
    `Bestellnummer: ${p.publicRef}`,
  ];
  const footer = "Zum Anhören und Herunterladen meldest du dich mit deinem melomio-Konto an.";
  return {
    subject,
    text: `${lines.join("\n\n")}\n\nZu deinem Song: ${p.orderUrl}\n\n${footer}`,
    html: layout(subject, lines, { label: "Zu deinem Song", url: p.orderUrl }, footer),
  };
}

/** Zweite Song-Version ist da – Kunde wählt seinen Favoriten, danach entsteht das Video. */
export function versionChoiceTemplate(p: {
  name?: string | null;
  publicRef: string;
  orderUrl: string;
  days: number;
  isTest: boolean;
}): Rendered {
  const subject = `${p.isTest ? "[TEST] " : ""}Zwei Versionen deines Songs – welche gefällt dir besser?`;
  const lines = [
    greeting(p.name),
    "danke für deinen Kauf! Wir haben deinen Song in einer zweiten, anders klingenden Version erstellt.",
    "Hör dir beide Versionen an und wähle deinen Favoriten. Danach erstellen wir dein Video.",
    `Wenn du nicht innerhalb von ${p.days} Tagen wählst, nehmen wir die Version aus deiner Hörprobe.`,
    `Bestellnummer: ${p.publicRef}`,
  ];
  const footer = "Zum Anhören meldest du dich mit deinem melomio-Konto an.";
  return {
    subject,
    text: `${lines.join("\n\n")}\n\nVersion wählen: ${p.orderUrl}\n\n${footer}`,
    html: layout(subject, lines, { label: "Version wählen", url: p.orderUrl }, footer),
  };
}

/** Affiliate: Bewerbung freigeschaltet / abgelehnt. */
export function affiliateDecisionTemplate(p: {
  name: string;
  approved: boolean;
  partnerUrl: string;
  isTest: boolean;
}): Rendered {
  const subject = `${p.isTest ? "[TEST] " : ""}${p.approved ? "Willkommen im melomio-Partnerprogramm" : "Deine Bewerbung als melomio-Partner"}`;
  const lines = p.approved
    ? [
        greeting(p.name),
        "deine Bewerbung als melomio-Partner ist freigeschaltet. 🎉",
        "In deinem Partnerbereich erstellst du jetzt deine Rabattcodes und siehst deine Verkäufe und Provisionen.",
      ]
    : [
        greeting(p.name),
        "danke für dein Interesse am melomio-Partnerprogramm. Leider können wir deine Bewerbung derzeit nicht annehmen.",
      ];
  return {
    subject,
    text: `${lines.join("\n\n")}\n\nPartnerbereich: ${p.partnerUrl}`,
    html: layout(
      subject,
      lines,
      { label: p.approved ? "Zum Partnerbereich" : "Partnerprogramm", url: p.partnerUrl },
      "",
    ),
  };
}

/** Affiliate: neue Gutschrift / Auszahlung. */
export function affiliatePayoutTemplate(p: {
  name: string;
  number: string;
  amount: string;
  partnerUrl: string;
  isTest: boolean;
}): Rendered {
  const subject = `${p.isTest ? "[TEST] " : ""}Deine Provision: Gutschrift ${p.number}`;
  const lines = [
    greeting(p.name),
    `wir haben deine fälligen Provisionen abgerechnet: ${p.amount}.`,
    "Die Gutschrift findest du im Anhang und in deinem Partnerbereich. Die Überweisung folgt in den nächsten Tagen.",
  ];
  return {
    subject,
    text: `${lines.join("\n\n")}\n\nPartnerbereich: ${p.partnerUrl}`,
    html: layout(subject, lines, { label: "Zum Partnerbereich", url: p.partnerUrl }, ""),
  };
}
