import path from "node:path";
import type { TimedLine } from "@/db/schema";

/**
 * Songtext im Video (C3): erzeugt eine ASS-Untertiteldatei, die FFmpeg (libass) ins Video brennt.
 * - aktuelle Zeile groß in der Bildmitte, die nächste kleiner darunter
 * - liefert der Musikanbieter Wort-Zeiten, füllt sich die Zeile Wort für Wort (Karaoke, \kf)
 */

/** Familienname der Schrift – libass sucht die Schrift über diesen Namen im Arbeitsordner. */
export function fontFamilyFor(fontFile: string): string {
  const name = path.basename(fontFile).toLowerCase();
  if (name.startsWith("dejavusans")) return "DejaVu Sans";
  if (name.startsWith("arial")) return "Arial";
  if (name.startsWith("segoeui")) return "Segoe UI";
  return path.basename(fontFile).replace(/[-_ ]?(bold|bd|b)?\.(ttf|otf)$/i, "");
}

function ts(ms: number): string {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

/** ASS-Sonderzeichen entschärfen (geschweifte Klammern starten Steuerbefehle). */
function esc(text: string): string {
  return text.replace(/\\/g, "＼").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, " ");
}

function karaoke(line: TimedLine): string {
  // Ohne Wort-Zeiten: ganze Zeile weiß (keine Füllung)
  if (!line.words?.length) return `{\\1c&HFFFFFF&}${esc(line.text)}`;
  let cursor = line.startMs;
  return line.words
    .map((w, i) => {
      // Pausen vor dem Wort dem Wort zuschlagen, damit die Füllung nicht vorauseilt
      const dur = Math.max(1, Math.round((w.endMs - cursor) / 10));
      cursor = w.endMs;
      return `{\\kf${dur}}${esc(w.text)}${i < line.words!.length - 1 ? " " : ""}`;
    })
    .join("");
}

export function buildLyricsAss(
  lines: TimedLine[],
  opts: { width: number; height: number; fontFamily: string; songDurationMs: number },
): string {
  const { width, height } = opts;
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Farben im ASS-Format &HAABBGGRR. Karaoke: gesungene Wörter goldgelb (#FFD647), noch nicht gesungene weiß
    `Style: Current,${opts.fontFamily},78,&H0047D6FF,&H00FFFFFF,&H64000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,2,5,90,90,0,1`,
    `Style: Next,${opts.fontFamily},54,&H30FFFFFF,&H30FFFFFF,&HB4000000,&H00000000,-1,0,0,0,100,100,0,0,1,1.5,0,5,110,110,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events: string[] = [];
  const sorted = [...lines].sort((a, b) => a.startMs - b.startMs);
  sorted.forEach((line, i) => {
    const next = sorted[i + 1];
    // Zeile bleibt stehen bis kurz vor der nächsten (höchstens 2,5 s Nachlauf), damit nichts flackert
    const shownFrom = Math.max(0, line.startMs - 250);
    const until = Math.min(
      next ? next.startMs - 250 : line.endMs + 2500,
      line.endMs + 2500,
      opts.songDurationMs,
    );
    if (until <= shownFrom) return;
    events.push(
      `Dialogue: 1,${ts(shownFrom)},${ts(until)},Current,,0,0,0,,{\\an5\\pos(${cx},${cy})}${karaoke(line)}`,
    );
    if (next && next.startMs - line.endMs < 4000) {
      events.push(
        `Dialogue: 0,${ts(shownFrom)},${ts(until)},Next,,0,0,0,,{\\an5\\pos(${cx},${cy + 190})}${esc(next.text)}`,
      );
    }
  });
  return [...header, ...events, ""].join("\n");
}
