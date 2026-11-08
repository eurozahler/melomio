import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import logoDark from "../../public/brand/melomio-logo-dark.png";
import logo from "../../public/brand/melomio-logo.png";
import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/server/session";

/** Kopfzeile: Marke links, rechts „Anmelden“ oder „Mein Konto“ (wird beim Aufruf ermittelt). */
export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" aria-label="melomio – zur Startseite" className="block">
          {/* Helles Logo auf hellem Grund, weiße Schrift im Dunkelmodus */}
          <Image src={logo} alt="melomio" priority className="h-8 w-auto dark:hidden" sizes="166px" />
          <Image
            src={logoDark}
            alt="melomio"
            priority
            className="hidden h-8 w-auto dark:block"
            sizes="166px"
          />
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
