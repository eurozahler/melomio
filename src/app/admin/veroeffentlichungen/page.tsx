import { Suspense } from "react";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import type { PublicationStatus } from "@/db/schema";
import { listPublications } from "@/publishing/service";
import { getDefaultFolder, getDropboxConnection } from "@/publishing/target";
import { requireAdmin } from "@/server/admin";
import { ActionButton, ReasonButton, SaveField } from "../admin-ui";
import {
  approvePublicationAction,
  disconnectDropboxAction,
  rejectPublicationAction,
  retryPublicationAction,
  saveDefaultFolderAction,
} from "./actions";

const STATUS: Record<PublicationStatus, string> = {
  rendering: "Video wird vorbereitet",
  awaiting_approval: "Wartet auf Freigabe",
  approved: "Freigegeben – wird hochgeladen",
  uploaded: "Hochgeladen",
  rejected: "Abgelehnt",
  withdrawn: "Vom Kunden widerrufen",
  failed: "Fehler",
};

export default function AdminPublications({ searchParams }: PageProps<"/admin/veroeffentlichungen">) {
  return (
    <Suspense fallback={null}>
      <Publications searchParams={searchParams} />
    </Suspense>
  );
}

async function Publications({ searchParams }: Pick<PageProps<"/admin/veroeffentlichungen">, "searchParams">) {
  await requireAdmin("/admin/veroeffentlichungen");
  const query = await searchParams;
  const db = getDb();
  const env = getEnv();
  const [pending, all, connection, defaultFolder] = await Promise.all([
    listPublications(db, ["awaiting_approval", "failed"]),
    listPublications(db),
    getDropboxConnection(db),
    getDefaultFolder(db),
  ]);
  const date = (d: Date | null) =>
    d
      ? d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })
      : "–";

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold tracking-tight">Veröffentlichungen</h1>

      <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-xl font-bold">
          Ziel: {env.PUBLISH_PROVIDER === "dropbox" ? "Dropbox (EasyGMV)" : "nur eigener Speicher (Test)"}
        </h2>
        {query.dropbox === "verbunden" && <p className="text-sm text-green-700">Dropbox verbunden ✔</p>}
        {query.dropbox === "fehler" && (
          <p className="text-sm text-red-700">Verbinden mit Dropbox hat nicht geklappt.</p>
        )}
        {env.PUBLISH_PROVIDER === "dropbox" ? (
          connection ? (
            <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="dropbox-status">
              <span>
                Verbunden mit <strong>{connection.accountName}</strong> seit{" "}
                {date(new Date(connection.connectedAt))}
              </span>
              <ActionButton
                label="Trennen"
                variant="secondary"
                confirmText="Dropbox wirklich trennen? Freigegebene Videos können dann nicht mehr hochgeladen werden."
                action={disconnectDropboxAction}
              />
            </div>
          ) : (
            <a
              href="/api/admin/dropbox/start"
              className="self-start rounded-lg bg-brand-strong px-4 py-2 text-sm font-semibold text-white"
            >
              Mit Dropbox verbinden
            </a>
          )
        ) : (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Im Testbetrieb landen freigegebene Videos nur im eigenen Speicher (Ordner „veroeffentlicht“). Für
            EasyGMV auf dem Server <code>PUBLISH_PROVIDER=dropbox</code> und die Dropbox-App-Schlüssel
            eintragen.
          </p>
        )}
        <SaveField
          label="Standardordner"
          hint="Gilt für Anlässe ohne eigenen Ordner (eigene Ordner unter „Fragebögen“ beim Anlass)."
          defaultValue={defaultFolder}
          inputMode="text"
          wide
          testId="default-folder"
          save={saveDefaultFolderAction}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Zu erledigen ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-neutral-500">Nichts zu tun.</p>}
        {pending.map((p) => (
          <article
            key={p.pub.id}
            className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 sm:flex-row dark:border-neutral-800"
            data-testid="publication-pending"
          >
            {p.pub.videoId && (
              <video
                controls
                preload="metadata"
                playsInline
                className="max-h-96 rounded-lg bg-black sm:w-56"
                src={`/api/admin/veroeffentlichung/${p.pub.id}`}
              />
            )}
            <div className="flex flex-1 flex-col gap-2 text-sm">
              <p>
                <strong>{p.ref}</strong> {p.isTest && "(Test)"} · {p.occasion.de}
                {p.template === "memorial" && <strong className="ml-1 text-red-700">· Trauer</strong>}
              </p>
              <p>Status: {STATUS[p.pub.status]}</p>
              {p.pub.error && <p className="text-red-700">{p.pub.error}</p>}
              <p>
                Kunde erlaubt: Fotos {p.choice?.photos ? "ja" : "nein"} · Titel{" "}
                {p.choice?.title ? "ja" : "nein"}
              </p>
              <p>Zielordner: {p.folder || `${defaultFolder} (Standard)`}</p>
              <div className="flex flex-wrap gap-2">
                {p.pub.status === "awaiting_approval" && (
                  <ActionButton
                    label="Freigeben und hochladen"
                    confirmText={`Video ${p.ref} wirklich veröffentlichen?`}
                    action={approvePublicationAction.bind(null, p.pub.id)}
                  />
                )}
                {p.pub.status === "failed" && (
                  <ActionButton
                    label="Erneut versuchen"
                    action={retryPublicationAction.bind(null, p.pub.id)}
                  />
                )}
                <ReasonButton
                  label="Ablehnen"
                  question={`Veröffentlichung ${p.ref} ablehnen?`}
                  action={rejectPublicationAction.bind(null, p.pub.id)}
                />
              </div>
            </div>
          </article>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-xl font-bold">Alle (neueste zuerst)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-neutral-500">
              <tr>
                <th className="py-1 pr-3">Bestellung</th>
                <th className="py-1 pr-3">Anlass</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Hochgeladen</th>
                <th className="py-1">Pfad</th>
              </tr>
            </thead>
            <tbody>
              {all.map((p) => (
                <tr key={p.pub.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-1 pr-3">
                    {p.ref}
                    {p.isTest && " (Test)"}
                  </td>
                  <td className="py-1 pr-3">{p.occasion.de}</td>
                  <td className="py-1 pr-3">{STATUS[p.pub.status]}</td>
                  <td className="py-1 pr-3">{date(p.pub.uploadedAt)}</td>
                  <td className="py-1 break-all">{p.pub.remotePath ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
