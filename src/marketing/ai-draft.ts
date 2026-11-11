import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { defaultLandingContent, type LandingContent } from "./landing";

/**
 * KI-Entwurf für Landingpage-Texte (Claude). Kostenpflichtig (ein Aufruf, wenige Cent) – läuft nur,
 * wenn der Admin auf „KI-Entwurf“ klickt und LYRICS_PROVIDER=anthropic mit Schlüssel gesetzt ist.
 * Sonst gibt es den festen Vorschlag. Der Entwurf wird NICHT automatisch gespeichert.
 */

export const LANDING_MODEL = "claude-opus-5-5";

const draftSchema = z.object({
  metaTitle: z.string(),
  metaDescription: z.string(),
  h1: z.string(),
  intro: z.string(),
  highlights: z.array(z.string()),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })),
  ctaLabel: z.string(),
});

const SYSTEM = `Du schreibst Texte für Landingpages von melomio (melomio.de), einem deutschen Dienst für personalisierte Songs mit Video.
So funktioniert melomio: Kundin/Kunde beantwortet einen Fragebogen zu Anlass und Person, wählt Musikstil, Stimmung und Stimme. Eine KI schreibt daraus einen Songtext, der geprüft und geändert werden kann. Danach gibt es eine kostenlose Hörprobe; erst wenn sie gefällt, wird bezahlt. Danach entstehen der fertige Song (MP3) und ein Video (mit eigenen Fotos möglich) sowie eine Song-Seite zum Teilen.

Regeln:
- Deutsch, Du-Form, warm und konkret, keine Übertreibungen, keine erfundenen Zahlen, Bewertungen, Preise oder Garantien.
- Für Suchmaschinen optimiert: das Hauptsuchwort natürlich in metaTitle, h1, intro und mindestens einer Zwischenüberschrift; keine Keyword-Wiederholungen.
- metaTitle höchstens 60 Zeichen und endet auf " | melomio". metaDescription 140–160 Zeichen mit Handlungsaufforderung.
- h1 höchstens 80 Zeichen. intro 2–3 Sätze. 4–6 highlights mit je höchstens 60 Zeichen.
- 3–4 sections (Zwischenüberschrift + 2–4 Sätze): Geschenkidee/Anlass, Ablauf, was den Song persönlich macht, Ideen zur Übergabe.
- 5–7 faqs mit Fragen, die Menschen bei Google wirklich stellen; Antworten 1–3 Sätze, sachlich richtig gemäß Beschreibung oben.
- ctaLabel höchstens 30 Zeichen.`;

export async function generateLandingDraft(p: {
  occasionName: string;
  slug: string;
  keyword: string;
  apiKey: string | null;
}): Promise<{ content: LandingContent; usedAi: boolean }> {
  const base = defaultLandingContent(p.occasionName, p.slug);
  if (!p.apiKey) return { content: base, usedAi: false };
  const client = new Anthropic({ apiKey: p.apiKey, maxRetries: 1 });
  const response = await client.beta.messages.parse({
    model: LANDING_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: betaZodOutputFormat(draftSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Anlass: ${p.occasionName}\nHauptsuchwort: ${p.keyword || `personalisierter Song ${p.occasionName}`}`,
      },
    ],
  });
  if (response.stop_reason !== "end_turn" || !response.parsed_output)
    throw new Error(`KI-Entwurf nicht vollständig (${response.stop_reason})`);
  const d = response.parsed_output;
  return {
    usedAi: true,
    content: {
      ...base,
      metaTitle: d.metaTitle.slice(0, 70),
      metaDescription: d.metaDescription.slice(0, 170),
      h1: d.h1.slice(0, 120),
      intro: d.intro.slice(0, 800),
      highlights: d.highlights.slice(0, 8).map((h) => h.slice(0, 140)),
      sections: d.sections.slice(0, 10).map((s) => ({ heading: s.heading.slice(0, 120), body: s.body.slice(0, 3000) })),
      faqs: d.faqs.slice(0, 15).map((f) => ({ q: f.q.slice(0, 200), a: f.a.slice(0, 1500) })),
      ctaLabel: d.ctaLabel.slice(0, 60),
    },
  };
}
