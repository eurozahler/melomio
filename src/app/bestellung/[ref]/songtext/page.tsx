import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AutoRefresh } from "@/components/auto-refresh";
import { Notice } from "@/components/auth-ui";
import { getDb } from "@/db/client";
import { getLyricsReview } from "@/orders/lyrics";
import { requireUser } from "@/server/session";
import { LyricsReview, LyricsView } from "./lyrics-review";

export default function LyricsPage({ params }: PageProps<"/bestellung/[ref]/songtext">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8 pb-28">
      <Suspense fallback={null}>
        <LyricsContent params={params} />
      </Suspense>
    </main>
  );
}

async function LyricsContent({ params }: Pick<PageProps<"/bestellung/[ref]/songtext">, "params">) {
  const { ref } = await params;
  const user = await requireUser(`/bestellung/${encodeURIComponent(ref)}/songtext`);
  const review = await getLyricsReview(getDb(), ref, user.id);
  if (!review) notFound(); // auch für fremde Bestellungen – sie existieren für dieses Konto nicht

  const t = await getTranslations("Lyrics");
  const { order, current } = review;
  const lyrics = current ? { title: current.title, sections: current.content.sections } : null;
  const generating = order.status === "created" || order.status === "lyrics_generating";
  const approved = !generating && order.status !== "lyrics_review" && order.status !== "failed";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-neutral-500">{t("orderRef", { ref: order.publicRef })}</p>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      </div>

      <AutoRefresh active={generating} />

      {generating && (
        <Notice kind="info">
          <span
            className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-strong"
            aria-hidden
          />
          {t("generating")}
        </Notice>
      )}

      {order.status === "failed" && <Notice kind="error">{t("failed")}</Notice>}

      {order.status === "lyrics_review" && lyrics && (
        <LyricsReview publicRef={order.publicRef} lyrics={lyrics} revisionsLeft={review.revisionsLeft} />
      )}

      {approved && lyrics && (
        <>
          <Notice kind="success">
            {t("approved")}{" "}
            <Link href={`/bestellung/${order.publicRef}`} className="font-semibold underline">
              {t("toOrder")}
            </Link>
          </Notice>
          <LyricsView lyrics={lyrics} />
        </>
      )}

      {/* Schutz: „bereit zur Prüfung“ ohne Text darf nie stumm bleiben (Vorfall mit veraltetem Worker) */}
      {!lyrics && order.status === "lyrics_review" && <Notice kind="error">{t("missing")}</Notice>}
      {!lyrics && !generating && order.status !== "failed" && order.status !== "lyrics_review" && (
        <p>{t("notReady")}</p>
      )}

      <Link href="/konto" className="text-sm font-semibold text-brand">
        ← {t("back")}
      </Link>
    </div>
  );
}
