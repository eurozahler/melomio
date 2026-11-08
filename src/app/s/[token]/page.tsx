import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { findActiveShare, getApprovedLyrics } from "@/orders/delivery";
import { LyricsView } from "@/app/bestellung/[ref]/songtext/lyrics-review";

/** Teilbare Song-Seite (E17): ohne Anmeldung, nur solange der Kunde sie eingeschaltet hat. */
export const metadata: Metadata = {
  // Private Song-Seiten gehören nicht in Suchmaschinen
  robots: { index: false, follow: false },
};

export default function SharePage({ params }: PageProps<"/s/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8">
      <Suspense fallback={null}>
        <ShareContent params={params} />
      </Suspense>
    </main>
  );
}

async function ShareContent({ params }: Pick<PageProps<"/s/[token]">, "params">) {
  const { token } = await params;
  const db = getDb();
  const share = await findActiveShare(db, token);
  if (!share) notFound();
  const lyrics = await getApprovedLyrics(db, share.order.id);
  const t = await getTranslations("Share");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight" data-testid="share-title">
        {lyrics?.title ?? "Ein Song für dich"}
      </h1>
      <audio
        controls
        preload="metadata"
        className="w-full"
        src={`/api/teilen/${token}/song`}
        data-testid="share-audio"
      />
      {lyrics && <LyricsView lyrics={lyrics} />}
      <div className="rounded-2xl bg-brand/10 p-5 text-center">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t("madeWith")}</p>
        <Link
          href="/"
          className="mt-3 inline-block rounded-full bg-brand-strong px-6 py-3 font-semibold text-white"
        >
          {t("cta")}
        </Link>
      </div>
    </div>
  );
}
