import Link from "next/link";

/** Unternavigation Marketing. Die Zugangsprüfung passiert in jeder Seite selbst. */
export default function MarketingLayout({ children }: LayoutProps<"/admin/marketing">) {
  const tab =
    "rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-semibold hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900";
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Marketing" className="flex flex-wrap gap-2">
        <Link href="/admin/marketing" className={tab}>
          Auswertung
        </Link>
        <Link href="/admin/marketing/landingpages" className={tab}>
          Landingpages
        </Link>
        <Link href="/admin/marketing/kampagnen" className={tab}>
          Werbekosten &amp; Links
        </Link>
        <Link href="/admin/marketing/google" className={tab}>
          Google
        </Link>
      </nav>
      {children}
    </div>
  );
}
