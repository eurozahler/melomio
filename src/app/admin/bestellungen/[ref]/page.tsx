import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getOrderDetail } from "@/admin/service";
import { getDb } from "@/db/client";
import { getApprovedLyrics } from "@/orders/delivery";
import { listLyricsVersions } from "@/orders/lyrics";
import { requireAdmin } from "@/server/admin";
import { LyricsView } from "@/app/bestellung/[ref]/songtext/lyrics-review";
import { approveCandidateAction, refundOrderAction, retryOrderAction } from "../../actions";
import { ActionButton, ReasonButton } from "../../admin-ui";

export default function AdminOrderDetail({ params }: PageProps<"/admin/bestellungen/[ref]">) {
  return (
    <Suspense fallback={null}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/bestellungen/[ref]">, "params">) {
  const { ref } = await params;
  await requireAdmin(`/admin/bestellungen/${encodeURIComponent(ref)}`);
  const db = getDb();
  const detail = await getOrderDetail(db, ref);
  if (!detail) notFound();
  const { order } = detail;
  const [tStatus, approved, versions] = await Promise.all([
    getTranslations("OrderStatus"),
    getApprovedLyrics(db, order.id),
    listLyricsVersions(db, order.id),
  ]);
  const current = versions[0];
  const lyrics = approved ?? (current ? { title: current.title, sections: current.content.sections } : null);
  const date = (d: Date) =>
    d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "medium" });
  const retryAction = retryOrderAction.bind(null, order.publicRef);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/bestellungen" className="text-sm text-neutral-500">
          ← Bestellungen
        </Link>
        <h1 className="mt-1 font-mono text-3xl font-bold">{order.publicRef}</h1>
        <p className="mt-1">
          <span className="font-semibold" data-testid="admin-order-status">
            {tStatus(order.status)}
          </span>{" "}
          · {detail.email}{" "}
          {order.isTest && <span className="rounded bg-amber-200 px-1.5 text-xs text-amber-900">TEST</span>}
        </p>
      </div>

      {order.status === "failed" && (
        <section className="rounded-xl border border-red-300 p-4">
          <p className="mb-2 font-semibold">
            Fehler – letzter Grund: {detail.history[0]?.reason ?? "unbekannt"}
          </p>
          <ActionButton
            label="Schritt wiederholen"
            action={retryAction}
            confirmText="Den fehlgeschlagenen Schritt wiederholen?"
          />
        </section>
      )}

      {order.paidAt && ["paid", "completed", "failed"].includes(order.status) && (
        <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-1 text-xl font-bold">Erstattung</h2>
          <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-300">
            Bucht den vollen Betrag über den Zahlungsanbieter zurück, erstellt die Stornorechnung und sperrt
            Downloads und Song-Seite.
          </p>
          <ReasonButton
            label="Bestellung erstatten"
            question={`Bestellung ${order.publicRef} wirklich erstatten? Das Geld geht sofort zurück, das lässt sich nicht rückgängig machen.`}
            action={refundOrderAction.bind(null, order.publicRef)}
            testId="refund-order"
          />
        </section>
      )}

      {["preview_ready", "awaiting_payment", "paid", "video_rendering", "completed", "refunded"].includes(
        order.status,
      ) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Hörprobe und Video</h2>
          <div>
            <p className="mb-1 text-sm font-semibold">Hörprobe (wie der Kunde sie hört)</p>
            <audio
              controls
              preload="none"
              className="w-full"
              src={`/api/admin/datei/hoerprobe/${order.publicRef}`}
            />
          </div>
          {["completed", "refunded"].includes(order.status) && (
            <div>
              <p className="mb-1 text-sm font-semibold">Kundenvideo</p>
              <video
                controls
                preload="none"
                playsInline
                className="max-h-[60vh] rounded-xl bg-black"
                src={`/api/admin/datei/video/${order.publicRef}`}
              />
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xl font-bold">Musik-Kandidaten</h2>
        {detail.candidates.length === 0 && <p className="text-neutral-500">Noch keine.</p>}
        <ul className="flex flex-col gap-3">
          {detail.candidates.map(({ candidate, phase, provider }) => (
            <li
              key={candidate.id}
              className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
              data-testid="admin-candidate"
            >
              <p className="text-sm">
                <span className="font-mono">{candidate.id.slice(0, 8)}</span> · {provider} · {phase} ·
                Prüfung: <strong>{candidate.qcStatus}</strong> · {Math.round(candidate.durationMs / 1000)} s
              </p>
              {Array.isArray((candidate.qcResult as { reasons?: string[] } | null)?.reasons) &&
                (candidate.qcResult as { reasons: string[] }).reasons.length > 0 && (
                  <p className="text-xs text-neutral-500">
                    {(candidate.qcResult as { reasons: string[] }).reasons.join("; ")}
                  </p>
                )}
              <audio
                controls
                preload="none"
                className="mt-2 w-full"
                src={`/api/admin/kandidat/${candidate.id}`}
              />
              {order.status === "manual_review" && candidate.qcStatus === "manual" && (
                <div className="mt-2">
                  <ActionButton
                    label="Kandidat freigeben"
                    action={approveCandidateAction.bind(null, order.publicRef, candidate.id)}
                    confirmText="Diesen Kandidaten nach dem Anhören freigeben?"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {lyrics && (
        <section>
          <h2 className="mb-2 text-xl font-bold">
            Songtext {approved ? "(freigegeben)" : `(Fassung ${current?.version}, ${current?.source})`}
          </h2>
          <LyricsView lyrics={lyrics} />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xl font-bold">Verlauf</h2>
        <ol className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
          {detail.history.map((h) => (
            <li key={h.id} className="px-3 py-2">
              <span className="text-neutral-500">{date(h.at)}</span> ·{" "}
              {h.fromStatus ? tStatus(h.fromStatus) : "–"} → <strong>{tStatus(h.toStatus)}</strong> ·{" "}
              {h.actor.length > 20 ? "Kunde/Admin" : h.actor}
              {h.reason && <span className="block text-xs text-neutral-500">{h.reason}</span>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
