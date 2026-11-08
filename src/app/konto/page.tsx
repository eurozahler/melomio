import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Notice } from "@/components/auth-ui";
import { cookies } from "next/headers";
import { attachDraftToUser, DRAFT_COOKIE, isValidDraftCookieId, listUserDrafts } from "@/server/drafts";
import { listOrdersForUser } from "@/server/orders";
import { requireUser } from "@/server/session";
import { WORKING_STATUSES } from "@/domain/order-status";
import { logoutAction } from "./actions";
import { AutoRefresh } from "./auto-refresh";

export default function AccountPage({ searchParams }: PageProps<"/konto">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-10">
      <Suspense fallback={null}>
        <AccountContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function AccountContent({ searchParams }: Pick<PageProps<"/konto">, "searchParams">) {
  const user = await requireUser("/konto");
  const t = await getTranslations("Account");
  const params = await searchParams;

  // Offenen Entwurf aus diesem Browser dem Konto zuordnen – auch wenn die Anmeldung nicht über
  // „Weiter zur Anmeldung“ kam (z. B. über einen erneut verschickten Bestätigungslink)
  const cookieId = (await cookies()).get(DRAFT_COOKIE)?.value;
  if (isValidDraftCookieId(cookieId)) await attachDraftToUser(cookieId, user.id);

  const [drafts, orders] = await Promise.all([listUserDrafts(user.id), listOrdersForUser(user.id)]);
  const tStatus = await getTranslations("OrderStatus");
  const newRef = typeof params.bestellung === "string" ? params.bestellung : null;
  const anyWorking = orders.some((o) => WORKING_STATUSES.includes(o.status));
  const formatDate = (d: Date) =>
    d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-300" data-testid="signed-in-as">
          {t("signedInAs", { email: user.email })}
        </p>
      </div>

      {/* Solange im Hintergrund gearbeitet wird, aktualisiert sich die Seite von selbst */}
      <AutoRefresh active={anyWorking} />

      {newRef && orders.some((o) => o.publicRef === newRef) && (
        <Notice kind="success">{t("orderCreated", { ref: newRef })}</Notice>
      )}
      {params.hinweis === "zu-viele-offen" && <Notice kind="error">{t("tooManyOpen")}</Notice>}

      <section aria-labelledby="orders">
        <h2 id="orders" className="mb-3 text-xl font-bold">
          {t("ordersTitle")}
        </h2>
        {orders.length === 0 ? (
          <p className="text-neutral-500">{t("ordersEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {orders.map((o) => (
              <li
                key={o.id}
                data-testid="order"
                className="rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{o.occasionName}</span>
                  <span className="text-xs text-neutral-500">{t("orderNumber", { ref: o.publicRef })}</span>
                </div>
                <p className="mt-1 flex items-center gap-2 text-sm" data-testid="order-status">
                  {WORKING_STATUSES.includes(o.status) && (
                    <span
                      className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-strong"
                      aria-hidden
                    />
                  )}
                  {tStatus(o.status)}
                </p>
                {o.status === "lyrics_review" && (
                  <p className="mt-1 text-xs text-neutral-500">{t("lyricsPending")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="drafts">
        <h2 id="drafts" className="mb-3 text-xl font-bold">
          {t("draftsTitle")}
        </h2>
        {drafts.length === 0 ? (
          <p className="text-neutral-500">{t("draftsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {drafts.map((d) => (
              <li
                key={d.occasionSlug}
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800"
              >
                <div>
                  <p className="font-semibold">{d.occasionName}</p>
                  <p className="text-sm text-neutral-500">
                    {t("updated", { date: formatDate(d.updatedAt) })}
                  </p>
                </div>
                <Link href={`/song/${d.occasionSlug}`} className="text-sm font-semibold text-brand">
                  {t("draftContinue")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/#anlaesse" className="rounded-full bg-brand-strong px-6 py-3 font-semibold text-white">
          {t("newSong")}
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-full border border-neutral-300 px-6 py-3 font-semibold dark:border-neutral-700"
          >
            {t("logout")}
          </button>
        </form>
      </div>
    </div>
  );
}
