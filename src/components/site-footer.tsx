import Link from "next/link";

/** Fußzeile mit den Rechtstexten – auf jeder Seite erreichbar (Impressumspflicht). */
export function SiteFooter() {
  const link = "underline hover:text-neutral-800 dark:hover:text-neutral-200";
  return (
    <footer className="border-t border-neutral-200 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
      <nav aria-label="Rechtliches" className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        <Link href="/impressum" className={link}>
          Impressum
        </Link>
        <Link href="/datenschutz" className={link}>
          Datenschutz
        </Link>
        <Link href="/agb" className={link}>
          AGB
        </Link>
        <Link href="/widerruf" className={link}>
          Widerrufsbelehrung
        </Link>
      </nav>
    </footer>
  );
}
