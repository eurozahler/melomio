import type { MusicSection } from "@/db/schema";

/**
 * Wo beginnt die 20-Sekunden-Hörprobe? (E12, F-19)
 * 1. Liefert der Anbieter Abschnittszeiten: beim ersten Refrain (dort wird gesungen)
 * 2. sonst: Ersatzwert aus den Einstellungen (Prozent der Songlänge)
 * Der Ausschnitt liegt immer vollständig innerhalb des Songs.
 */
export function choosePreviewStart(input: {
  durationMs: number;
  previewMs: number;
  sections: MusicSection[] | null;
  fallbackPct: number;
}): { startMs: number; method: "provider_sections" | "fallback" } {
  const latest = Math.max(0, input.durationMs - input.previewMs);
  const chorus = input.sections?.find((s) => s.label.toLowerCase() === "chorus");
  if (chorus) return { startMs: Math.min(Math.max(0, chorus.startMs), latest), method: "provider_sections" };
  const fallback = Math.round((input.durationMs * input.fallbackPct) / 100);
  return { startMs: Math.min(fallback, latest), method: "fallback" };
}
