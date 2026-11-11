import { and, eq } from "drizzle-orm";
import type { Database } from "./client";
import {
  appSettings,
  genres,
  moods,
  occasions,
  prices,
  products,
  promptVersions,
  questionOptions,
  questionnaireVersions,
  questions,
  taxRates,
  videoTemplates,
  voices,
} from "./schema";
import {
  de,
  SEED_GENRES,
  SEED_MOODS,
  SEED_OCCASIONS,
  SEED_PRODUCT,
  SEED_TAX_RATE,
  SEED_VIDEO_TEMPLATE,
  SEED_VOICES,
} from "./seed-data";
import { SETTINGS, SETTING_KEYS } from "./settings";
import { LYRICS_DEFAULT_MODEL, LYRICS_SYSTEM_PROMPT_KEY, LYRICS_SYSTEM_PROMPT_V1 } from "../lyrics/prompts";

/**
 * Spielt die Beispieldaten ein. Kann beliebig oft laufen:
 * Vorhandene Einträge (z. B. im Admin geänderte) werden NICHT überschrieben.
 */
export async function seed(db: Database) {
  await db.transaction(async (tx) => {
    // Auswahllisten
    for (const [table, rows] of [
      [genres, SEED_GENRES],
      [moods, SEED_MOODS],
      [voices, SEED_VOICES],
    ] as const) {
      await tx
        .insert(table)
        .values(rows.map(([slug, name, promptHint], i) => ({ slug, name: de(name), promptHint, sort: i })))
        .onConflictDoNothing({ target: table.slug });
    }

    // Anlässe mit Fragebogen-Version 1
    for (const [i, occ] of SEED_OCCASIONS.entries()) {
      await tx
        .insert(occasions)
        .values({
          slug: occ.slug,
          name: de(occ.name),
          description: de(occ.description),
          sort: i,
          active: occ.active ?? true,
          videoTemplate: occ.videoTemplate ?? null,
        })
        .onConflictDoNothing({ target: occasions.slug });
      const [occasion] = await tx.select().from(occasions).where(eq(occasions.slug, occ.slug));
      if (!occasion) throw new Error(`Anlass ${occ.slug} fehlt`);

      const existing = await tx
        .select({ id: questionnaireVersions.id })
        .from(questionnaireVersions)
        .where(eq(questionnaireVersions.occasionId, occasion.id));
      if (existing.length > 0) continue; // Versionen sind unveränderlich – nie überschreiben

      const [version] = await tx
        .insert(questionnaireVersions)
        .values({ occasionId: occasion.id, version: 1, publishedAt: new Date() })
        .returning();
      if (!version) throw new Error("Fragebogen-Version konnte nicht angelegt werden");

      for (const [sort, q] of occ.questions.entries()) {
        const [question] = await tx
          .insert(questions)
          .values({
            versionId: version.id,
            key: q.key,
            type: q.type,
            label: de(q.label),
            help: q.help ? de(q.help) : null,
            placeholder: q.placeholder ? de(q.placeholder) : null,
            required: q.required ?? false,
            maxLength: q.maxLength ?? null,
            sort,
            condition: q.condition ?? null,
          })
          .returning();
        if (!question) throw new Error(`Frage ${q.key} konnte nicht angelegt werden`);
        if (q.options?.length) {
          await tx.insert(questionOptions).values(
            q.options.map(([value, label], s) => ({
              questionId: question.id,
              value,
              label: de(label),
              sort: s,
            })),
          );
        }
      }
    }

    // Steuer, Produkt, Preis
    await tx.insert(taxRates).values(SEED_TAX_RATE).onConflictDoNothing({ target: taxRates.slug });
    const [tax] = await tx.select().from(taxRates).where(eq(taxRates.slug, SEED_TAX_RATE.slug));
    await tx
      .insert(products)
      .values({ slug: SEED_PRODUCT.slug, name: de(SEED_PRODUCT.name) })
      .onConflictDoNothing({ target: products.slug });
    const [product] = await tx.select().from(products).where(eq(products.slug, SEED_PRODUCT.slug));
    if (!tax || !product) throw new Error("Steuer oder Produkt fehlt");
    const hasPrice = await tx
      .select({ id: prices.id })
      .from(prices)
      .where(and(eq(prices.productId, product.id)));
    if (hasPrice.length === 0) {
      await tx
        .insert(prices)
        .values({ productId: product.id, grossCents: SEED_PRODUCT.grossCents, taxRateId: tax.id });
    }

    // Standard-Videovorlage
    await tx
      .insert(videoTemplates)
      .values(SEED_VIDEO_TEMPLATE)
      .onConflictDoNothing({ target: videoTemplates.slug });

    // System-Prompt für Songtexte, Version 1 (nur, wenn es noch keine Fassung gibt)
    const prompts = await tx
      .select({ id: promptVersions.id })
      .from(promptVersions)
      .where(eq(promptVersions.key, LYRICS_SYSTEM_PROMPT_KEY));
    if (prompts.length === 0) {
      await tx.insert(promptVersions).values({
        key: LYRICS_SYSTEM_PROMPT_KEY,
        version: 1,
        template: LYRICS_SYSTEM_PROMPT_V1,
        model: LYRICS_DEFAULT_MODEL,
        active: true,
        createdBy: "seed",
      });
    }

    // Einstellungen mit Standardwerten
    await tx
      .insert(appSettings)
      .values(SETTING_KEYS.map((key) => ({ key, value: SETTINGS[key].default, updatedBy: "seed" })))
      .onConflictDoNothing({ target: appSettings.key });
  });
}
