import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { getLandingForEdit } from "@/marketing/landing";
import { requireAdmin } from "@/server/admin";
import { aiDraftAction, publishLandingAction, saveLandingAction } from "../../actions";
import { LandingEditor } from "./landing-editor";

/** Landingpage eines Anlasses bearbeiten. */
export default function EditLanding({ params }: PageProps<"/admin/marketing/landingpages/[id]">) {
  return (
    <Suspense fallback={null}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<PageProps<"/admin/marketing/landingpages/[id]">, "params">) {
  const { id } = await params;
  await requireAdmin(`/admin/marketing/landingpages/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getLandingForEdit(getDb(), id);
  if (!data) notFound();
  const env = getEnv();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/marketing/landingpages" className="text-sm underline">
        ← Alle Landingpages
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Landingpage: {data.occasionName}</h1>
      {!data.occasionActive && (
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
          Der Anlass ist noch inaktiv. Die Seite geht erst online, wenn Anlass UND Seite aktiv bzw. veröffentlicht sind.
        </p>
      )}
      <LandingEditor
        occasionId={data.occasionId}
        exists={data.exists}
        initial={data.content}
        baseUrl={env.APP_BASE_URL}
        aiAvailable={env.LYRICS_PROVIDER === "anthropic" && Boolean(env.ANTHROPIC_API_KEY)}
        save={saveLandingAction}
        publish={publishLandingAction}
        aiDraft={aiDraftAction}
      />
    </div>
  );
}
