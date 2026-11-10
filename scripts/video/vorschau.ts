/**
 * Erzeugt ein kurzes Beispielvideo mit mitlaufendem Songtext (ohne KI, ohne Kosten) – zum Ansehen
 * von Layout und Schrift. Aufruf: npx tsx scripts/video/vorschau.ts [Zielordner]
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { generateTestSong } from "../../src/media/ffmpeg";
import { renderStandardVideo, resolveFontFile } from "../../src/media/video";

loadEnvConfig(process.cwd());
const dir = path.resolve(process.argv[2] ?? "hoertest/video-vorschau");
const tools = { ffmpeg: process.env.FFMPEG_PATH || "ffmpeg", ffprobe: process.env.FFPROBE_PATH || "ffprobe" };
const t = (s: number) => s * 1000;

async function main() {
  await mkdir(dir, { recursive: true });
  const audio = path.join(dir, "song.mp3");
  await generateTestSong(tools, audio, { durationS: 14, introS: 2, mode: "normal" });
  const output = path.join(dir, "vorschau.mp4");
  await renderStandardVideo(tools, {
    workDir: dir,
    audioFile: audio,
    outputFile: output,
    title: "Dein Tag, Anna",
    durationMs: 14000,
    fontFile: resolveFontFile(process.env.VIDEO_FONT_FILE),
    testWatermark: true,
    lyrics: [
      {
        startMs: t(2),
        endMs: t(5),
        text: "Heute ist dein Tag, liebe Anna,",
        words: [
          { startMs: t(2), endMs: t(2.5), text: "Heute" },
          { startMs: t(2.5), endMs: t(2.8), text: "ist" },
          { startMs: t(2.8), endMs: t(3.2), text: "dein" },
          { startMs: t(3.2), endMs: t(3.8), text: "Tag," },
          { startMs: t(3.8), endMs: t(4.3), text: "liebe" },
          { startMs: t(4.3), endMs: t(5), text: "Anna," },
        ],
      },
      { startMs: t(5.2), endMs: t(8), text: "die Sonne lacht nur für dich allein." },
      { startMs: t(8.2), endMs: t(12), text: "Jürgen hält die Karte falsch herum {und} lacht, bis der Bus hält" },
    ],
  });
  console.log(`✓ ${output}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
