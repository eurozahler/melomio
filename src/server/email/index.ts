import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "@/config/env";
import { getDb, type Database } from "@/db/client";
import { devMailbox, emailEvents } from "@/db/schema";

/**
 * E-Mail-Versand hinter einer austauschbaren Schnittstelle (docs/ARCHITEKTUR.md, Abschnitt 3).
 * - console: Testbetrieb. Die E-Mail landet im Test-Postfach (/dev/mailbox) und im Server-Log.
 * - smtp:    Livebetrieb über ein Postfach der eigenen Domain (Strato).
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Name der Vorlage, z. B. "verify-email" – für das Versandprotokoll. */
  template: string;
  userId?: string | null;
  orderId?: string | null;
};

interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage, db: Database): Promise<{ providerMessageId: string | null }>;
}

const consoleProvider: EmailProvider = {
  name: "console",
  async send(message, db) {
    const [row] = await db
      .insert(devMailbox)
      .values({
        recipient: message.to,
        subject: message.subject,
        template: message.template,
        text: message.text,
        html: message.html,
      })
      .returning({ id: devMailbox.id });
    console.log(`[E-Mail/Test] an ${message.to}: „${message.subject}“ → im Test-Postfach /dev/mailbox`);
    return { providerMessageId: row?.id ?? null };
  },
};

let transport: Transporter | undefined;

const smtpProvider: EmailProvider = {
  name: "smtp",
  async send(message) {
    const env = getEnv();
    transport ??= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT),
      secure: Number(env.SMTP_PORT) === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });
    const info = await transport.sendMail({
      from: env.SMTP_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { providerMessageId: info.messageId ?? null };
  },
};

function getProvider(): EmailProvider {
  return getEnv().EMAIL_PROVIDER === "smtp" ? smtpProvider : consoleProvider;
}

/** Versendet eine E-Mail und protokolliert den Versand (Erfolg oder Fehler) in email_events. */
export async function sendEmail(message: EmailMessage, db: Database = getDb()): Promise<void> {
  const provider = getProvider();
  try {
    const { providerMessageId } = await provider.send(message, db);
    await db.insert(emailEvents).values({
      userId: message.userId ?? null,
      orderId: message.orderId ?? null,
      template: message.template,
      recipient: message.to,
      provider: provider.name,
      providerMessageId,
      status: "sent",
    });
  } catch (error) {
    await db
      .insert(emailEvents)
      .values({
        userId: message.userId ?? null,
        orderId: message.orderId ?? null,
        template: message.template,
        recipient: message.to,
        provider: provider.name,
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : "unbekannt",
      })
      .catch(() => undefined);
    throw error;
  }
}
