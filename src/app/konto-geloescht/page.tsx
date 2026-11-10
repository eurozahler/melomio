import Link from "next/link";

/** Bestätigung nach dem Löschen des Kontos. */
export default function Page() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Dein Konto ist gelöscht</h1>
      <p className="mt-4 text-neutral-700 dark:text-neutral-300">
        Wir haben deine Songtexte, Antworten, Songs und Videos gelöscht und dich abgemeldet. Rechnungen und
        Zahlungsnachweise bewahren wir nur so lange auf, wie das Gesetz es verlangt.
      </p>
      <Link href="/" className="mt-6 inline-block font-semibold text-brand">
        Zur Startseite →
      </Link>
    </main>
  );
}
