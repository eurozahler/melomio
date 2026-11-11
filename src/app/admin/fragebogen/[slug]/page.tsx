import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getQuestionnaireEditor } from "@/admin/questionnaire";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/server/admin";
import {
  discardDraftAction,
  publishDraftAction,
  saveDraftAction,
  startDraftAction,
  updateOccasionAction,
  updateOccasionPublishingAction,
} from "../actions";
import { OccasionPublishing, OccasionSettings, QuestionnaireEditor, StartDraftButton } from "../builder-ui";
import { getSetting } from "@/db/settings-store";
import { getDefaultFolder } from "@/publishing/target";

export default function AdminQuestionnaireEditor({ params }: PageProps<"/admin/fragebogen/[slug]">) {
  return (
    <Suspense fallback={null}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/fragebogen/[slug]">, "params">) {
  const { slug } = await params;
  await requireAdmin(`/admin/fragebogen/${encodeURIComponent(slug)}`);
  const db = getDb();
  const data = await getQuestionnaireEditor(db, slug);
  if (!data) notFound();
  const { occasion, draft, published } = data;
  const date = (d: Date) =>
    d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/fragebogen" className="text-sm text-neutral-500">
          ← Fragebögen
        </Link>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{occasion.name.de}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {published
            ? `Veröffentlicht: Fassung ${published.version} (${date(published.publishedAt)})`
            : "Noch nicht veröffentlicht"}
          {occasion.active && (
            <>
              {" · "}
              <a
                href={`/song/${occasion.slug}`}
                target="_blank"
                rel="noreferrer"
                className="text-brand underline"
              >
                für Kunden ansehen
              </a>
            </>
          )}
        </p>
      </div>

      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-xl font-bold">Anlass</h2>
        <OccasionSettings
          initial={{
            name: occasion.name.de,
            description: occasion.description?.de ?? "",
            active: occasion.active,
          }}
          save={updateOccasionAction.bind(null, occasion.slug)}
        />
      </section>

      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-xl font-bold">Veröffentlichung und Video</h2>
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-300">
          Leer lassen = Standard aus „Veröffentlichungen“ bzw. „Einstellungen“. Jeder Ordner kann einem
          eigenen TikTok-Kanal in EasyGMV entsprechen.
        </p>
        <OccasionPublishing
          initial={{
            folder: occasion.publicationFolder ?? "",
            discountPct:
              occasion.publicationDiscountPct === null ? "" : String(occasion.publicationDiscountPct),
            videoTemplate: occasion.videoTemplate === "memorial" ? "memorial" : "standard",
          }}
          defaults={{
            folder: await getDefaultFolder(db),
            discountPct: await getSetting(db, "publication_discount_pct"),
          }}
          save={updateOccasionPublishingAction.bind(null, occasion.slug)}
        />
      </section>

      <section>
        <h2 className="mb-1 text-xl font-bold">{draft ? `Entwurf (Fassung ${draft.version})` : "Fragen"}</h2>
        {draft ? (
          <>
            <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">
              Änderungen sind erst nach „Veröffentlichen“ für Kunden sichtbar. Tipp: Die Antworten gehen als
              Material an die Songtext-KI – offene Fragen zu Erlebnissen und Eigenheiten ergeben die
              persönlichsten Texte.
            </p>
            <QuestionnaireEditor
              key={draft.version}
              initial={draft.questions}
              save={saveDraftAction.bind(null, occasion.slug)}
              publish={publishDraftAction.bind(null, occasion.slug)}
              discard={discardDraftAction.bind(null, occasion.slug)}
            />
          </>
        ) : (
          <>
            <ol
              className="mb-4 flex list-decimal flex-col gap-1 pl-5 text-sm"
              data-testid="published-questions"
            >
              {published?.questions.map((q) => (
                <li key={q.key}>
                  {q.label}
                  {q.required && <span className="text-red-700"> *</span>}
                  {q.condition && <span className="text-xs text-neutral-500"> (Folgefrage)</span>}
                </li>
              ))}
            </ol>
            <StartDraftButton start={startDraftAction.bind(null, occasion.slug)} />
          </>
        )}
      </section>
    </div>
  );
}
