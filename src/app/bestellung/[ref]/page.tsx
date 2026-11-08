import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AutoRefresh } from "@/components/auto-refresh";
import { Notice } from "@/components/auth-ui";
import { getDb } from "@/db/client";
import type { OrderStatus } from "@/domain/order-status";
import { getOwnedOrder } from "@/orders/lyrics";
import { requireUser } from "@/server/session";

const STEPS = ["lyrics", "music", "preview", "payment", "delivery"] as const;

/** Welcher Schritt ist gerade dran? (Anzeige für Kunden) */
function currentStep(status: OrderStatus): number {
  switch (status) {
    case "created":
    case "lyrics_generating":
    case "lyrics_review":
      return 0;
    case "lyrics_approved":
    case "music_generating":
    case "manual_review":
      return 1;
    case "preview_ready":
      return 2;
    case "awaiting_payment":
      return 3;
    default:
      return 4;
  }
}

export default function OrderPage({ params }: PageProps<"/bestellung/[ref]">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8">
      <Suspense fallback={null}>
        <OrderContent params={params} />
      </Suspense>
    </main>
  );
}

async function OrderContent({ params }: Pick<PageProps<"/bestellung/[ref]">, "params">) {
  const { ref } = await params;
  const user = await requireUser(`/bestellung/${encodeURIComponent(ref)}`);
  const order = await getOwnedOrder(getDb(), ref, user.id);
  if (!order) notFound();

  const t = await getTranslations("Order");
  const tStatus = await getTranslations("OrderStatus");
  const step = currentStep(order.status);
  const working = ["created", "lyrics_generating", "lyrics_approved", "music_generating"].includes(
    order.status,
  );
  const hasPreview = ["preview_ready", "awaiting_payment", "paid", "video_rendering", "completed"].includes(
    order.status,
  );

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh active={working} />
      <div>
        <p className="text-sm text-neutral-500">{t("orderRef", { ref: order.publicRef })}</p>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-300" data-testid="order-status">
          {tStatus(order.status)}
        </p>
      </div>

      <ol className="grid grid-cols-5 gap-1 text-center text-xs" aria-label="Fortschritt">
        {STEPS.map((key, i) => (
          <li key={key} aria-current={i === step ? "step" : undefined}>
            <div
              className={`h-1.5 rounded-full ${i <= step ? "bg-brand-gradient" : "bg-neutral-200 dark:bg-neutral-800"}`}
            />
            <span className={`mt-1 block ${i === step ? "font-semibold text-brand" : "text-neutral-500"}`}>
              {t(`steps.${key}`)}
            </span>
          </li>
        ))}
      </ol>

      {(order.status === "lyrics_approved" || order.status === "music_generating") && (
        <Notice kind="info">
          <span
            className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-strong"
            aria-hidden
          />
          {t("musicGenerating")}
        </Notice>
      )}
      {order.status === "manual_review" && <Notice kind="info">{t("manualReview")}</Notice>}
      {order.status === "failed" && <Notice kind="error">{t("failed")}</Notice>}

      {hasPreview && (
        <section
          className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800"
          aria-labelledby="preview"
        >
          <h2 id="preview" className="text-xl font-bold">
            {t("previewTitle")}
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t("previewText")}</p>
          <audio
            controls
            preload="metadata"
            controlsList="nodownload"
            className="mt-4 w-full"
            src={`/api/hoerprobe/${order.publicRef}`}
            data-testid="preview-audio"
          />
          {order.status === "preview_ready" && (
            <>
              <button
                type="button"
                disabled
                className="mt-4 w-full rounded-full bg-brand-strong px-6 py-3 font-semibold text-white opacity-60"
              >
                {t("buy")}
              </button>
              <p className="mt-1 text-center text-xs text-neutral-500">{t("buyPending")}</p>
            </>
          )}
        </section>
      )}

      <div className="flex flex-col gap-2 text-sm font-semibold">
        <Link href={`/bestellung/${order.publicRef}/songtext`} className="text-brand">
          {order.status === "lyrics_review" ? t("lyricsReviewLink") : t("lyricsLink")} →
        </Link>
        <Link href="/konto" className="text-neutral-500">
          ← Mein Konto
        </Link>
      </div>
    </div>
  );
}
