import { Suspense } from "react";
import Link from "next/link";
import { listUsers, rolesOf, type UserFilter } from "@/admin/users";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/server/admin";
import { ActionButton, ReasonButton } from "../admin-ui";
import { blockUserAction, inviteStaffAction, setRoleAction, unblockUserAction } from "./actions";
import { InviteForm } from "./invite-form";

export default function AdminUsers({ searchParams }: PageProps<"/admin/benutzer">) {
  return (
    <Suspense fallback={null}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Inhaber",
  admin: "Admin",
  support: "Support",
  content_reviewer: "Prüfer",
  customer: "Kunde",
};

const AFFILIATE_LABEL: Record<string, string> = {
  pending: "Partner (Bewerbung)",
  active: "Partner",
  rejected: "Partner (abgelehnt)",
  blocked: "Partner (gesperrt)",
};

async function Users({ searchParams }: Pick<PageProps<"/admin/benutzer">, "searchParams">) {
  const me = await requireAdmin("/admin/benutzer");
  const p = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(p.q).slice(0, 100);
  const filterParam = one(p.filter);
  const filter: UserFilter = filterParam === "staff" || filterParam === "blocked" ? filterParam : "all";
  const db = getDb();
  const [{ rows, total }, myRoles] = await Promise.all([listUsers(db, { q, filter }), rolesOf(db, me.id)]);
  const isOwner = myRoles.includes("owner");
  const input =
    "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
  const date = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
  const badge = "rounded px-1.5 py-0.5 text-xs font-semibold";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Benutzer</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Kunden registrieren sich selbst. Hier vergibst du Admin-Rechte, lädst neue Admins ein und sperrst
          Konten. {!isOwner && "Rollen ändern und einladen darf nur ein Inhaber."}
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm text-neutral-600 dark:text-neutral-300">
          <li>
            <strong>Inhaber</strong>: alles, auch Rollen vergeben und Mitarbeiter sperren.
          </li>
          <li>
            <strong>Admin</strong>: ganzer Admin-Bereich, aber keine Rollen ändern.
          </li>
          <li>Partner (Affiliates) brauchen keine Rolle – sie werden unter „Affiliates“ freigeschaltet.</li>
        </ul>
      </div>

      {isOwner && <InviteForm invite={inviteStaffAction} />}

      <form className="flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={q} placeholder="E-Mail oder Name" className={input} aria-label="Suche" />
        <select name="filter" defaultValue={filter} className={input} aria-label="Filter">
          <option value="all">Alle Konten</option>
          <option value="staff">Nur Inhaber und Admins</option>
          <option value="blocked">Nur gesperrte</option>
        </select>
        <button className="rounded-lg bg-brand-strong px-4 py-2 text-sm font-semibold text-white">Suchen</button>
      </form>

      <p className="text-xs text-neutral-500">
        {rows.length} von {total} Konten angezeigt{rows.length === 50 && " – für mehr bitte die Suche nutzen"}.
      </p>

      <ul className="flex flex-col gap-3" data-testid="user-list">
        {rows.map((u) => {
          const self = u.id === me.id;
          const staff = u.roles.includes("owner") || u.roles.includes("admin");
          const canBlock = !self && !u.roles.includes("owner") && (isOwner || !staff);
          return (
            <li
              key={u.id}
              data-testid="user-row"
              className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong className="break-all">{u.deletedAt ? "(gelöschtes Konto)" : u.email}</strong>
                {u.name && <span className="text-neutral-500">{u.name}</span>}
                {self && <span className={`${badge} bg-neutral-200 text-neutral-800`}>Du</span>}
                {u.roles.map((r) => (
                  <span key={r} className={`${badge} bg-brand/15 text-brand-strong`}>
                    {ROLE_LABEL[r] ?? r}
                  </span>
                ))}
                {u.affiliateStatus && (
                  <span className={`${badge} bg-neutral-100 text-neutral-700`}>
                    {AFFILIATE_LABEL[u.affiliateStatus] ?? "Partner"}
                  </span>
                )}
                {u.blockedAt && <span className={`${badge} bg-red-100 text-red-800`}>Gesperrt</span>}
                {!u.emailVerified && !u.deletedAt && (
                  <span className={`${badge} bg-amber-100 text-amber-900`}>E-Mail nicht bestätigt</span>
                )}
              </div>
              <p className="text-xs text-neutral-500">
                Seit {date(u.createdAt)} · {u.paidOrders} bezahlte Bestellung{u.paidOrders === 1 ? "" : "en"}
                {u.paidOrders > 0 && !u.deletedAt && (
                  <>
                    {" · "}
                    <Link className="underline" href={`/admin/bestellungen?q=${encodeURIComponent(u.email)}`}>
                      ansehen
                    </Link>
                  </>
                )}
                {u.blockedAt && ` · gesperrt am ${date(u.blockedAt)}${u.blockedReason ? `: ${u.blockedReason}` : ""}`}
              </p>
              {!u.deletedAt && (
                <div className="flex flex-wrap items-start gap-2">
                  {isOwner &&
                    !u.blockedAt &&
                    (["admin", "owner"] as const).map((role) => {
                      const has = u.roles.includes(role);
                      if (has && role === "owner" && self) return null;
                      return (
                        <ActionButton
                          key={role}
                          variant="secondary"
                          label={`${has ? "Entziehen" : "Machen zu"}: ${ROLE_LABEL[role]}`}
                          confirmText={
                            has
                              ? `${u.email} die Rolle „${ROLE_LABEL[role]}“ wirklich entziehen?`
                              : `${u.email} wirklich zum ${ROLE_LABEL[role]} machen? ${role === "owner" ? "Inhaber dürfen alles, auch Rollen vergeben." : "Admins sehen alle Bestellungen und Kundendaten."}`
                          }
                          action={setRoleAction.bind(null, u.id, role, !has)}
                        />
                      );
                    })}
                  {u.blockedAt ? (
                    (isOwner || !staff) && (
                      <ActionButton
                        variant="secondary"
                        label="Entsperren"
                        action={unblockUserAction.bind(null, u.id)}
                      />
                    )
                  ) : (
                    canBlock && (
                      <ReasonButton
                        label="Sperren"
                        question={`${u.email} sperren? Das Konto wird sofort abgemeldet und kann sich nicht mehr anmelden. Bestellungen bleiben erhalten.`}
                        action={blockUserAction.bind(null, u.id)}
                      />
                    )
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
