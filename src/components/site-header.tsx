import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/server/session";

/** Kopfzeile: Marke links, rechts „Anmelden“ oder „Mein Konto“ (wird beim Aufruf ermittelt). */
export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-sm font-bold tracking-[0.3em] text-rose-600 uppercase">
          melomio
        </Link>
        <Suspense fallback={<span className="h-5 w-20" />}>
          <AccountLink />
        </Suspense>
      </div>
    </header>
  );
}

async function AccountLink() {
  const [user, t] = await Promise.all([getSessionUser(), getTranslations("Header")]);
  return (
    <Link href={user ? "/konto" : "/anmelden"} className="text-sm font-semibold" data-testid="header-account">
      {user ? t("account") : t("login")}
    </Link>
  );
}
