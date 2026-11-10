import { and, eq, gte, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { emailEvents } from "@/db/schema";
import { getCompanyProfile } from "@/invoices/company";
import { sendEmail } from "@/server/email";

/**
 * Alarme an den Betreiber (C9): per E-Mail an ALERT_EMAIL (sonst an die E-Mail aus „Firma“).
 * Derselbe Alarm (gleicher Schlüssel) geht höchstens einmal pro Tag raus, damit kein Postfach
 * überläuft. Fehler beim Alarmieren werden nur protokolliert – sie dürfen nie den Betrieb stören.
 */

async function recipient(db: Database): Promise<string | null> {
  const fromEnv = process.env.ALERT_EMAIL?.trim();
  if (fromEnv) return fromEnv;
  const { profile } = await getCompanyProfile(db);
  return profile.email || null;
}

export async function sendAlert(
  db: Database,
  key: string,
  subject: string,
  lines: string[],
): Promise<boolean> {
  try {
    const template = `alert:${key}`.slice(0, 120);
    const today = sql`(date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')`;
    const [already] = await db
      .select({ id: emailEvents.id })
      .from(emailEvents)
      .where(and(eq(emailEvents.template, template), gte(emailEvents.createdAt, today)))
      .limit(1);
    if (already) return false;
    const to = await recipient(db);
    console.warn(`[Alarm] ${subject} – ${lines.join(" | ")}`);
    if (!to) return false;
    const text = [...lines, "", "– melomio Überwachung"].join("\n");
    const html = `<div style="font-family:sans-serif"><h2>${escape(subject)}</h2>${lines
      .map((l) => `<p>${escape(l)}</p>`)
      .join("")}<p style="color:#888">– melomio Überwachung</p></div>`;
    await sendEmail({ to, subject: `[melomio Alarm] ${subject}`, text, html, template }, db);
    return true;
  } catch (error) {
    console.error("[Alarm] konnte nicht gesendet werden:", error);
    return false;
  }
}

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
