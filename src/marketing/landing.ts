import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/admin/service";
import type { Database } from "@/db/client";
import { landingPages, occasions } from "@/db/schema";
import type { LandingFaq, LandingSection, LandingVariant } from "@/db/schema";
import type { LocalizedText } from "@/db/schema";

/**
 * Landingpages je Anlass (/lieder/<slug>): Texte, FAQ, Kampagnen-Varianten und Hörbeispiel
 * pflegt der Admin. Unveröffentlichte Seiten sieht nur der Admin (Vorschau).
 */

export class LandingError extends Error {
  constructor(
    public readonly code: "not_found" | "invalid" | "slug_taken",
    public readonly problems: string[] = [],
  ) {
    super(`Landingpage: ${code}`);
    this.name = "LandingError";
  }
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const t = (max: number) => z.string().trim().max(max);

export const landingInputSchema = z.object({
  slug: z.string().trim().toLowerCase().min(3).max(80).regex(SLUG_RE, "Nur a–z, 0–9 und Bindestriche"),
  metaTitle: t(70),
  metaDescription: t(170),
  h1: t(120),
  intro: t(800),
  highlights: z.array(t(140)).max(8),
  sections: z.array(z.object({ heading: t(120), body: t(3000) })).max(10),
  faqs: z.array(z.object({ q: t(200), a: t(1500) })).max(15),
  variants: z
    .array(
      z.object({
        key: z.string().trim().toLowerCase().min(1).max(40).regex(SLUG_RE, "Nur a–z, 0–9 und Bindestriche"),
        h1: t(120),
        intro: t(800),
      }),
    )
    .max(20),
  ctaLabel: t(60),
  sampleTitle: t(120).nullable().optional(),
});

export type LandingInput = z.infer<typeof landingInputSchema>;

export type LandingContent = {
  slug: string;
  published: boolean;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  highlights: string[];
  sections: LandingSection[];
  faqs: LandingFaq[];
  variants: LandingVariant[];
  ctaLabel: string;
  sampleAudioKey: string | null;
  sampleTitle: string | null;
};

const name = (n: LocalizedText) => n.de;

/** Vorschlag zum Start, damit eine neue Seite nicht leer ist (wird im Admin angepasst). */
export function defaultLandingContent(occasionName: string, slug: string): LandingContent {
  return {
    slug,
    published: false,
    metaTitle: `Persönlicher Song zum Anlass ${occasionName} | melomio`.slice(0, 70),
    metaDescription:
      `Dein eigener Song zum Anlass ${occasionName}: Du erzählst, wir machen daraus ein einzigartiges Lied mit Video. Kostenlose Hörprobe vor dem Kauf.`.slice(
        0,
        170,
      ),
    h1: `Ein Song, der nur für diesen Moment geschrieben ist: ${occasionName}`,
    intro:
      "Beantworte ein paar Fragen zu der Person und euren gemeinsamen Momenten. Daraus entsteht ein persönlicher Songtext und ein fertig produzierter Song mit Video – zum Verschenken, Abspielen und Teilen.",
    highlights: [
      "Songtext aus deinen eigenen Geschichten",
      "Kostenlose Hörprobe vor dem Kauf",
      "Fertiger Song mit Video zum Teilen",
      "In wenigen Minuten erstellt",
    ],
    sections: [
      {
        heading: "So entsteht dein Song",
        body: "Du beantwortest einen kurzen Fragebogen, wählst Musikstil, Stimmung und Stimme. Wir schreiben daraus den Songtext, den du prüfen und ändern kannst. Danach hörst du eine kostenlose Hörprobe – erst wenn sie dir gefällt, bezahlst du.",
      },
    ],
    faqs: [
      {
        q: "Kann ich den Song vorher anhören?",
        a: "Ja. Du bekommst eine kostenlose Hörprobe und bezahlst erst, wenn dir der Song gefällt.",
      },
      {
        q: "Wie lange dauert es?",
        a: "Songtext und Hörprobe sind meist nach wenigen Minuten fertig, Song und Video kurz nach dem Kauf.",
      },
    ],
    variants: [],
    ctaLabel: "Jetzt Song erstellen",
    sampleAudioKey: null,
    sampleTitle: null,
  };
}

/** Alle Anlässe mit (falls vorhanden) ihrer Landingpage – für die Admin-Übersicht. */
export async function listLandingPages(db: Database) {
  const rows = await db
    .select({ occasion: occasions, landing: landingPages })
    .from(occasions)
    .leftJoin(landingPages, eq(landingPages.occasionId, occasions.id))
    .orderBy(asc(occasions.sort), asc(occasions.slug));
  return rows.map((r) => ({
    occasionId: r.occasion.id,
    occasionSlug: r.occasion.slug,
    occasionName: name(r.occasion.name),
    occasionActive: r.occasion.active,
    landing: r.landing,
  }));
}

/** Inhalt für die Admin-Bearbeitung: gespeicherte Seite oder Vorschlag. */
export async function getLandingForEdit(db: Database, occasionId: string) {
  const [row] = await db
    .select({ occasion: occasions, landing: landingPages })
    .from(occasions)
    .leftJoin(landingPages, eq(landingPages.occasionId, occasions.id))
    .where(eq(occasions.id, occasionId));
  if (!row) return null;
  const occasionName = name(row.occasion.name);
  return {
    occasionId: row.occasion.id,
    occasionSlug: row.occasion.slug,
    occasionName,
    occasionActive: row.occasion.active,
    exists: Boolean(row.landing),
    content: row.landing ? toContent(row.landing) : defaultLandingContent(occasionName, row.occasion.slug),
  };
}

function toContent(l: typeof landingPages.$inferSelect): LandingContent {
  return {
    slug: l.slug,
    published: l.published,
    metaTitle: l.metaTitle,
    metaDescription: l.metaDescription,
    h1: l.h1,
    intro: l.intro,
    highlights: l.highlights,
    sections: l.sections,
    faqs: l.faqs,
    variants: l.variants,
    ctaLabel: l.ctaLabel,
    sampleAudioKey: l.sampleAudioKey,
    sampleTitle: l.sampleTitle,
  };
}

/** Für die öffentliche Seite. `includeDrafts` nur für die Admin-Vorschau. */
export async function getLandingBySlug(db: Database, slug: string, includeDrafts = false) {
  if (!SLUG_RE.test(slug) || slug.length > 80) return null;
  const [row] = await db
    .select({ occasion: occasions, landing: landingPages })
    .from(landingPages)
    .innerJoin(occasions, eq(landingPages.occasionId, occasions.id))
    .where(eq(landingPages.slug, slug));
  if (!row) return null;
  if (!includeDrafts && (!row.landing.published || !row.occasion.active)) return null;
  return {
    occasionSlug: row.occasion.slug,
    occasionName: name(row.occasion.name),
    occasionActive: row.occasion.active,
    updatedAt: row.landing.updatedAt,
    ...toContent(row.landing),
  };
}

/** Veröffentlichte Seiten (für Sitemap, Startseite und Fußzeile). */
export async function listPublishedLandings(db: Database) {
  const rows = await db
    .select({
      slug: landingPages.slug,
      updatedAt: landingPages.updatedAt,
      occasionSlug: occasions.slug,
      occasionName: occasions.name,
    })
    .from(landingPages)
    .innerJoin(occasions, eq(landingPages.occasionId, occasions.id))
    .where(eq(landingPages.published, true))
    .orderBy(asc(occasions.sort));
  const active = await db.select({ slug: occasions.slug, active: occasions.active }).from(occasions);
  return rows
    .filter((r) => active.find((a) => a.slug === r.occasionSlug)?.active)
    .map((r) => ({ ...r, occasionName: name(r.occasionName) }));
}

/** Speichert die Seite (legt sie bei Bedarf an). Leere Listeneinträge werden entfernt. */
export async function saveLanding(db: Database, actorId: string, occasionId: string, raw: unknown) {
  const parsed = landingInputSchema.safeParse(raw);
  if (!parsed.success)
    throw new LandingError(
      "invalid",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  const input = parsed.data;
  const values = {
    slug: input.slug,
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
    h1: input.h1,
    intro: input.intro,
    highlights: input.highlights.filter(Boolean),
    sections: input.sections.filter((s) => s.heading || s.body),
    faqs: input.faqs.filter((f) => f.q && f.a),
    variants: input.variants.filter((v) => v.key),
    ctaLabel: input.ctaLabel,
    sampleTitle: input.sampleTitle ?? null,
    updatedBy: actorId,
    updatedAt: new Date(),
  };
  const keys = values.variants.map((v) => v.key);
  if (new Set(keys).size !== keys.length) throw new LandingError("invalid", ["Varianten-Kürzel doppelt"]);

  const [occasion] = await db.select({ id: occasions.id }).from(occasions).where(eq(occasions.id, occasionId));
  if (!occasion) throw new LandingError("not_found");
  const [taken] = await db
    .select({ occasionId: landingPages.occasionId })
    .from(landingPages)
    .where(eq(landingPages.slug, values.slug));
  if (taken && taken.occasionId !== occasionId) throw new LandingError("slug_taken");

  await db.transaction(async (tx) => {
    const [old] = await tx.select().from(landingPages).where(eq(landingPages.occasionId, occasionId));
    await tx
      .insert(landingPages)
      .values({ occasionId, ...values })
      .onConflictDoUpdate({ target: landingPages.occasionId, set: values });
    await audit(tx, {
      actorUserId: actorId,
      action: old ? "landing.update" : "landing.create",
      entity: "landing_page",
      entityId: occasionId,
      oldValue: old ? { slug: old.slug, h1: old.h1 } : null,
      newValue: { slug: values.slug, h1: values.h1 },
    });
  });
}

/** Veröffentlichen ist erst möglich, wenn Titel, Beschreibung, Überschrift und Einleitung gefüllt sind. */
export async function setLandingPublished(db: Database, actorId: string, occasionId: string, published: boolean) {
  const [row] = await db.select().from(landingPages).where(eq(landingPages.occasionId, occasionId));
  if (!row) throw new LandingError("not_found");
  if (published) {
    const missing = [
      !row.metaTitle && "Seitentitel",
      !row.metaDescription && "Beschreibung",
      !row.h1 && "Überschrift",
      !row.intro && "Einleitung",
    ].filter(Boolean) as string[];
    if (missing.length) throw new LandingError("invalid", missing.map((m) => `${m} fehlt`));
  }
  await db
    .update(landingPages)
    .set({ published, updatedBy: actorId, updatedAt: new Date() })
    .where(eq(landingPages.occasionId, occasionId));
  await audit(db, {
    actorUserId: actorId,
    action: published ? "landing.publish" : "landing.unpublish",
    entity: "landing_page",
    entityId: occasionId,
  });
}

export async function setLandingSample(
  db: Database,
  actorId: string,
  occasionId: string,
  storageKey: string | null,
) {
  const [row] = await db.select().from(landingPages).where(eq(landingPages.occasionId, occasionId));
  if (!row) throw new LandingError("not_found");
  await db
    .update(landingPages)
    .set({ sampleAudioKey: storageKey, updatedBy: actorId, updatedAt: new Date() })
    .where(eq(landingPages.occasionId, occasionId));
  await audit(db, {
    actorUserId: actorId,
    action: storageKey ? "landing.sample_upload" : "landing.sample_remove",
    entity: "landing_page",
    entityId: occasionId,
  });
  return row.sampleAudioKey;
}

/** MP3 erkennen: ID3-Kopf oder MPEG-Frame-Sync. */
export function looksLikeMp3(buf: Buffer) {
  if (buf.length < 4) return false;
  if (buf.subarray(0, 3).toString("latin1") === "ID3") return true;
  return buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0;
}
