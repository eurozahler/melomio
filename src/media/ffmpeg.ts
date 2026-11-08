import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Hilfsfunktionen rund um FFmpeg (Audio/Video). FFmpeg läuft als eigenes Programm;
 * Pfade kommen aus FFMPEG_PATH / FFPROBE_PATH. Argumente werden als Liste übergeben,
 * nie als zusammengesetzter Befehlstext (kein Einschleusen von Befehlen möglich).
 */

export type MediaTools = { ffmpeg: string; ffprobe: string };

const TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BUFFER = 20 * 1024 * 1024;

async function ffmpeg(tools: MediaTools, args: string[]) {
  return run(tools.ffmpeg, ["-hide_banner", "-nostdin", ...args], {
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
}

export type ProbeResult = {
  durationMs: number;
  codec: string | null;
  sampleRate: number | null;
  channels: number | null;
};

/** Liest Dauer und Format einer Audiodatei. Wirft, wenn die Datei nicht lesbar ist. */
export async function probeAudio(tools: MediaTools, file: string): Promise<ProbeResult> {
  const { stdout } = await run(
    tools.ffprobe,
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-select_streams", "a:0", file],
    { timeout: 60_000, maxBuffer: MAX_BUFFER },
  );
  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_name?: string; sample_rate?: string; channels?: number }>;
  };
  const stream = data.streams?.[0];
  const duration = Number(data.format?.duration);
  if (!stream || !Number.isFinite(duration)) throw new Error("Keine lesbare Audiospur");
  return {
    durationMs: Math.round(duration * 1000),
    codec: stream.codec_name ?? null,
    sampleRate: stream.sample_rate ? Number(stream.sample_rate) : null,
    channels: stream.channels ?? null,
  };
}

export type Silence = { startMs: number; endMs: number };

/** Findet stille Stellen (leiser als thresholdDb, mindestens minSeconds lang). */
export async function detectSilence(
  tools: MediaTools,
  file: string,
  options: { thresholdDb?: number; minSeconds?: number } = {},
): Promise<Silence[]> {
  const { thresholdDb = -45, minSeconds = 2 } = options;
  const { stderr } = await ffmpeg(tools, [
    "-i",
    file,
    "-af",
    `silencedetect=noise=${thresholdDb}dB:d=${minSeconds}`,
    "-f",
    "null",
    "-",
  ]);
  const silences: Silence[] = [];
  let start: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const s = /silence_start: (-?[\d.]+)/.exec(line);
    if (s) start = Math.max(0, Number(s[1]));
    const e = /silence_end: ([\d.]+)/.exec(line);
    if (e && start !== null) {
      silences.push({ startMs: Math.round(start * 1000), endMs: Math.round(Number(e[1]) * 1000) });
      start = null;
    }
  }
  // Stille bis zum Dateiende hat kein silence_end
  if (start !== null) silences.push({ startMs: Math.round(start * 1000), endMs: Number.POSITIVE_INFINITY });
  return silences;
}

/**
 * Schneidet die Hörprobe (E12): Ausschnitt ab startMs, sanft ein- und ausgeblendet, mit hörbarem
 * Wasserzeichen (kurzer Signalton alle paar Sekunden). Ergebnis: MP3, nur dieser Ausschnitt.
 */
export async function cutPreview(
  tools: MediaTools,
  input: string,
  output: string,
  options: { startMs: number; durationMs: number },
): Promise<void> {
  const start = (options.startMs / 1000).toFixed(3);
  const dur = options.durationMs / 1000;
  const fadeOutStart = Math.max(0, dur - 1.5).toFixed(3);
  // Signalton 880 Hz, 0,35 s lang, alle 5 s (ab Sekunde 2), leise unter die Musik gemischt
  const watermark = `aevalsrc=0.18*sin(2*PI*880*t)*lt(mod(t+3\\,5)\\,0.35):s=44100:d=${dur}`;
  await ffmpeg(tools, [
    "-y",
    "-ss",
    start,
    "-t",
    String(dur),
    "-i",
    input,
    "-filter_complex",
    `[0:a]aresample=44100,afade=t=in:st=0:d=1,afade=t=out:st=${fadeOutStart}:d=1.5[m];${watermark}[w];[m][w]amix=inputs=2:duration=first:normalize=0[out]`,
    "-map",
    "[out]",
    "-ac",
    "2",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    output,
  ]);
}

/**
 * Test-Song für den Mock-Musikanbieter: Akkord im Hintergrund, ab dem Ende des Intros eine
 * „Gesangsstimme“ (Ton mit Vibrato). mode "silent" erzeugt eine stumme Datei (für Prüf-Tests).
 */
export async function generateTestSong(
  tools: MediaTools,
  output: string,
  options: { durationS: number; introS: number; mode?: "normal" | "silent" },
): Promise<void> {
  const { durationS, introS, mode = "normal" } = options;
  const source =
    mode === "silent"
      ? `anullsrc=r=44100:cl=stereo:d=${durationS}`
      : `aevalsrc=0.10*sin(2*PI*220*t)+0.08*sin(2*PI*277.18*t)+0.08*sin(2*PI*329.63*t)+gt(t\\,${introS})*0.20*sin(2*PI*523.25*t+3*sin(2*PI*5*t)):s=44100:d=${durationS}`;
  await ffmpeg(tools, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    source,
    "-ac",
    "2",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    output,
  ]);
}
