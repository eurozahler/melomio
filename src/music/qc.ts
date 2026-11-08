import type { Silence } from "@/media/ffmpeg";

/**
 * Technische Qualitätsprüfung eines Kandidaten (Entwicklungsplan M6). Reine Logik auf
 * Messwerten aus FFmpeg – keine Garantie, dass die „beste“ Version erkannt wird (Pflichtenheft 3.7).
 *
 * Ergebnis:
 * - passed: technisch in Ordnung
 * - failed: unbrauchbar (nicht lesbar, viel zu kurz/lang, lange Stille)
 * - manual: unsicher → manuelle Prüfung durch einen Menschen
 */

export type QcInput = {
  decodable: boolean;
  durationMs: number;
  silences: Silence[];
  targetDurationS: number;
};

export type QcResult = { status: "passed" | "failed" | "manual"; reasons: string[] };

/** Stille am Anfang/Ende (Ein- und Ausklang) ist normal und zählt nicht. */
const EDGE_MS = 3000;

export function evaluateQuality(input: QcInput): QcResult {
  if (!input.decodable) return { status: "failed", reasons: ["Datei nicht lesbar"] };

  const failed: string[] = [];
  const manual: string[] = [];
  const target = input.targetDurationS * 1000;
  const d = input.durationMs;

  if (d < target * 0.5 || d > target * 2)
    failed.push(`Dauer ${Math.round(d / 1000)} s weit außerhalb des Ziels`);
  else if (d < target * 0.75 || d > target * 1.5)
    manual.push(`Dauer ${Math.round(d / 1000)} s weicht deutlich ab`);

  const clipped = input.silences.map((s) => ({
    startMs: Math.max(s.startMs, EDGE_MS),
    endMs: Math.min(s.endMs, d - EDGE_MS),
  }));
  const inner = clipped.filter((s) => s.endMs > s.startMs);
  const longest = Math.max(0, ...inner.map((s) => s.endMs - s.startMs));
  const total = inner.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);

  if (total > d * 0.25) failed.push("mehr als ein Viertel Stille");
  else if (longest > 8000) failed.push(`Stille von ${Math.round(longest / 1000)} s mitten im Song`);
  else if (longest > 4000) manual.push(`Pause von ${Math.round(longest / 1000)} s mitten im Song`);

  if (failed.length) return { status: "failed", reasons: [...failed, ...manual] };
  if (manual.length) return { status: "manual", reasons: manual };
  return { status: "passed", reasons: [] };
}
