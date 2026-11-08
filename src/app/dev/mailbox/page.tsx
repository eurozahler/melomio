import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { hasTestMailbox } from "@/server/email/test-mailbox";
import { getDb } from "@/db/client";
import { devMailbox } from "@/db/schema";

/**
 * Test-Postfach (nur Testbetrieb mit EMAIL_PROVIDER=console). Im Livebetrieb gibt es diese Seite nicht.
 */
export default function MailboxPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10">
      <Suspense fallback={null}>
        <Mailbox />
      </Suspense>
    </main>
  );
}

const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;

async function Mailbox() {
  await connection();
  if (!hasTestMailbox()) notFound();

  const t = await getTranslations("Mailbox");
  const mails = await getDb().select().from(devMailbox).orderBy(desc(devMailbox.createdAt)).limit(50);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-300">{t("intro")}</p>
      </div>
      {mails.length === 0 && <p className="text-neutral-500">{t("empty")}</p>}
      {mails.map((mail) => {
        const links = [...new Set(mail.text.match(URL_PATTERN) ?? [])];
        return (
          <article
            key={mail.id}
            data-testid="mail"
            className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <p className="text-sm text-neutral-500">
              {mail.createdAt.toLocaleString("de-DE")} · {t("to")}:{" "}
              <span data-testid="mail-to">{mail.recipient}</span>
            </p>
            <h2 className="mt-1 text-lg font-semibold">{mail.subject}</h2>
            <pre className="mt-3 font-sans text-sm whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
              {mail.text}
            </pre>
            {links.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-semibold">{t("links")}</p>
                <ul>
                  {links.map((href) => (
                    <li key={href}>
                      <a
                        href={href}
                        className="text-sm break-all text-brand underline"
                        data-testid="mail-link"
                      >
                        {href}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
