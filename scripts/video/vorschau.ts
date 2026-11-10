/**
 * Erzeugt ein kurzes Beispielvideo mit mitlaufendem Songtext (ohne KI, ohne Kosten) – zum Ansehen
 * von Layout und Schrift. Aufruf: npx tsx scripts/video/vorschau.ts [Zielordner] [--fotos]
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import { generateTestSong } from "../../src/media/ffmpeg";
import { renderStandardVideo, resolveFontFile } from "../../src/media/video";

loadEnvConfig(process.cwd());
const dir = path.resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "hoertest/video-vorschau");
const tools = { ffmpeg: process.env.FFMPEG_PATH || "ffmpeg", ffprobe: process.env.FFPROBE_PATH || "ffprobe" };
const t = (s: number) => s * 1000;

async function main() {
  await mkdir(dir, { recursive: true });
  const audio = path.join(dir, "song.mp3");
  await generateTestSong(tools, audio, { durationS: 14, introS: 2, mode: "normal" });
  // Beispielfotos (Hoch- und Querformat) – mit „--fotos“ wird eine Slideshow erzeugt
  const photos: string[] = [];
  if (process.argv.includes("--fotos")) {
    const specs = [
      { w: 1200, h: 1600, c: "#2f7d6d" },
      { w: 1600, h: 1000, c: "#c0612b" },
      { w: 1000, h: 1000, c: "#3a4fa8" },
    ];
    for (const [i, s] of specs.entries()) {
      const file = path.join(dir, `foto${i}.jpg`);
      const svg = `<svg width="${s.w}" height="${s.h}"><rect width="100%" height="100%" fill="${s.c}"/><circle cx="50%" cy="45%" r="${Math.min(s.w, s.h) / 4}" fill="#ffffff55"/><text x="50%" y="85%" font-size="90" text-anchor="middle" fill="#fff" font-family="sans-serif">Foto ${i + 1}</text></svg>`;
      await sharp(Buffer.from(svg)).jpeg().toFile(file);
      photos.push(file);
    }
  }
  const output = path.join(dir, "vorschau.mp4");
  await renderStandardVideo(tools, {
    workDir: dir,
    audioFile: audio,
    outputFile: output,
    title: "Dein Tag, Anna",
    durationMs: 14000,
    fontFile: resolveFontFile(process.env.VIDEO_FONT_FILE),
    testWatermark: true,
    photos,
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
