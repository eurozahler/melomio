import { execFile } from "node:child_process";
import type { TimedLine } from "@/db/schema";
import { buildLyricsAss, fontFamilyFor } from "./lyrics-ass";
import { copyFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { MediaTools } from "./ffmpeg";

const run = promisify(execFile);

/**
 * Standardvideo (Modul M8): 1080×1920 (9:16), H.264/AAC, animierter Farbverlauf in den
 * Markenfarben, Songtitel und Marke. Im Testbetrieb mit Wasserzeichen „TEST“.
 * Titel und Schrift werden als Dateien übergeben – Sonderzeichen im Titel können FFmpeg
 * so nicht durcheinanderbringen (kein Einschleusen in die Filterbeschreibung).
 */

export type VideoTemplateConfig = {
  colors?: string[];
  width?: number;
  height?: number;
  /** Songtext im Video mitlaufen lassen (Standard: ja, wenn Zeilenzeiten vorhanden). */
  showLyrics?: boolean;
};

export type ProbeVideoResult = {
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
  durationMs: number;
};

export async function probeVideo(tools: MediaTools, file: string): Promise<ProbeVideoResult> {
  const { stdout } = await run(
    tools.ffprobe,
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
    { timeout: 60_000, maxBuffer: 20 * 1024 * 1024 },
  );
  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
  };
  const video = data.streams?.find((s) => s.codec_type === "video");
  const audio = data.streams?.find((s) => s.codec_type === "audio");
  return {
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    durationMs: Math.round(Number(data.format?.duration ?? 0) * 1000),
  };
}

/** Bricht den Titel in höchstens `maxLines` Zeilen mit je ca. `maxChars` Zeichen um. */
export function wrapTitle(title: string, maxChars = 16, maxLines = 4): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/[.,;:!?]?$/, "")}…`;
    return kept;
  }
  return lines;
}

/** Schriftdatei: VIDEO_FONT_FILE oder eine gängige fette Systemschrift (Windows/Ubuntu). */
export function resolveFontFile(configured?: string | null): string {
  const candidates = [
    configured,
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/segoeuib.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  ].filter((f): f is string => Boolean(f));
  const found = candidates.find((f) => existsSync(f));
  if (!found) throw new Error("Keine Schriftdatei für das Video gefunden (VIDEO_FONT_FILE setzen)");
  return found;
}

const hex = (c: string) => `0x${c.replace(/^#/, "")}`;

export async function renderStandardVideo(
  tools: MediaTools,
  options: {
    workDir: string;
    audioFile: string;
    outputFile: string;
    title: string;
    durationMs: number;
    fontFile: string;
    testWatermark: boolean;
    config?: VideoTemplateConfig;
    /** Gesungene Zeilen mit Zeiten → Songtext läuft im Video mit (C3). Ohne: nur der Titel. */
    lyrics?: TimedLine[] | null;
    /** Fotos (lokale JPEG-Dateien) für die Slideshow (C2). Ohne: Farbverlauf als Hintergrund. */
    photos?: string[];
  },
): Promise<void> {
  const { workDir, config = {} } = options;
  const width = config.width ?? 1080;
  const height = config.height ?? 1920;
  const [c0 = "#fd6f6d", c1 = "#7821cd"] = config.colors ?? [];
  const seconds = Math.ceil(options.durationMs / 1000) + 1;

  // Schrift und Texte in den Arbeitsordner – FFmpeg läuft dort mit relativen Pfaden
  await copyFile(options.fontFile, path.join(workDir, "font.ttf"));
  const withLyrics = !!options.lyrics?.length;
  const photos = (options.photos ?? []).slice(0, 20);
  // Mit Songtext oder Fotos: Titel klein oben. Sonst: Titel groß in der Bildmitte.
  const compact = withLyrics || photos.length > 0;
  const lines = compact ? wrapTitle(options.title, 22, 2) : wrapTitle(options.title);
  const fontSize = compact ? 68 : lines.length <= 2 ? 104 : 88;
  const lineHeight = Math.round(fontSize * 1.25);
  const blockTop = compact ? 220 : Math.round(height / 2 - (lines.length * lineHeight) / 2);

  const filters: string[] = [];
  if (photos.length) {
    // Lesbarkeit: dunkler Verlauf oben (Titel) und ein Band hinter dem Songtext
    filters.push(`drawbox=x=0:y=0:w=iw:h=520:color=black@0.30:t=fill`);
    if (withLyrics) filters.push(`drawbox=x=0:y=ih/2-230:w=iw:h=520:color=black@0.35:t=fill`);
  }
  for (const [i, line] of lines.entries()) {
    await writeFile(path.join(workDir, `line${i}.txt`), line, "utf8");
    filters.push(
      `drawtext=fontfile=font.ttf:textfile=line${i}.txt:fontcolor=white:fontsize=${fontSize}:` +
        `x=(w-text_w)/2:y=${blockTop + i * lineHeight}:shadowcolor=black@0.35:shadowx=4:shadowy=4`,
    );
  }
  await writeFile(path.join(workDir, "brand.txt"), "melomio", "utf8");
  filters.push(
    `drawtext=fontfile=font.ttf:textfile=brand.txt:fontcolor=white@0.9:fontsize=56:x=(w-text_w)/2:y=h-240`,
  );
  if (options.testWatermark) {
    await writeFile(path.join(workDir, "test.txt"), "TEST", "utf8");
    filters.push(
      `drawtext=fontfile=font.ttf:textfile=test.txt:fontcolor=white@0.30:fontsize=280:x=(w-text_w)/2:y=${compact ? "h-620" : "260"}`,
    );
  }
  if (withLyrics) {
    const ass = buildLyricsAss(options.lyrics!, {
      width,
      height,
      fontFamily: fontFamilyFor(options.fontFile),
      songDurationMs: options.durationMs,
    });
    await writeFile(path.join(workDir, "lyrics.ass"), ass, "utf8");
    filters.push("ass=lyrics.ass:fontsdir=.");
  }

  // Hintergrund: Slideshow aus den Fotos oder bewegter Farbverlauf
  let background: string[];
  let graph: string;
  if (photos.length) {
    const seg = seconds / photos.length;
    const fade = Math.min(0.6, seg / 4);
    background = photos.flatMap((p) => ["-loop", "1", "-t", seg.toFixed(3), "-i", path.resolve(p)]);
    const parts = photos.map(
      (_, i) =>
        `[${i + 1}:v]split[a${i}][b${i}];` +
        `[a${i}]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=30:4,eq=brightness=-0.12[bg${i}];` +
        `[b${i}]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg${i}];` +
        `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=25,format=yuv420p,` +
        `fade=t=in:st=0:d=${fade.toFixed(2)},fade=t=out:st=${(seg - fade).toFixed(3)}:d=${fade.toFixed(2)}[p${i}]`,
    );
    graph = `${parts.join(";")};${photos.map((_, i) => `[p${i}]`).join("")}concat=n=${photos.length}:v=1:a=0,${filters.join(",")}[v]`;
  } else {
    background = [
      "-f",
      "lavfi",
      "-i",
      `gradients=s=${width}x${height}:c0=${hex(c0)}:c1=${hex(c1)}:x0=0:y0=0:x1=${width}:y1=${height}:speed=0.008:r=25:d=${seconds}`,
    ];
    graph = `[1:v]${filters.join(",")}[v]`;
  }

  await run(
    tools.ffmpeg,
    [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-i",
      path.resolve(options.audioFile),
      ...background,
      "-filter_complex",
      graph,
      "-map",
      "[v]",
      "-map",
      "0:a",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      path.resolve(options.outputFile),
    ],
    { cwd: workDir, timeout: 15 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 },
  );
}
