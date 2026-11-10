import Link from "next/link";

/** Rahmen des Admin-Bereichs. Die Zugangsprüfung passiert in jeder Seite und jeder Aktion selbst. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  const link =
    "rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800";
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6">
      <nav className="mb-6 flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-3 dark:border-neutral-800">
        <span className="mr-2 text-xs font-bold tracking-widest text-brand uppercase">Admin</span>
        <Link href="/admin" className={link}>
          Übersicht
        </Link>
        <Link href="/admin/bestellungen" className={link}>
          Bestellungen
        </Link>
        <Link href="/admin/fragebogen" className={link}>
          Fragebögen
        </Link>
        <Link href="/admin/prompts" className={link}>
          Prompt
        </Link>
        <Link href="/admin/rechnungen" className={link}>
          Rechnungen
        </Link>
        <Link href="/admin/firma" className={link}>
          Firma
        </Link>
        <Link href="/admin/einstellungen" className={link}>
          Einstellungen
        </Link>
      </nav>
      {children}
    </div>
  );
}
