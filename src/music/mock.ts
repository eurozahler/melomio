import { randomUUID } from "node:crypto";
import path from "node:path";
import { generateTestSong, type MediaTools } from "@/media/ffmpeg";
import type { MusicInput, MusicProvider, MusicResult } from "./types";

/**
 * Test-Baustein (Mock) für Musik: erzeugt eine erkennbare Test-Tonfolge mit FFmpeg – keine KI,
 * keine Kosten. Für Tests einstellbar über Umgebungsvariablen:
 * - MOCK_MUSIC_DURATION_S  Länge des Test-Songs (Standard: Ziellänge aus den Einstellungen)
 * - MOCK_MUSIC_DELAY_MS    simulierte Wartezeit (Standard 2000)
 * - MOCK_MUSIC_FAILURE_RATE  Anteil fehlschlagender Aufträge 0…1 (Standard 0)
 * - MOCK_MUSIC_MODE        "silent" erzeugt stumme Dateien (Prüfung muss sie ablehnen)
 */

function num(name: string, fallback: number) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function createMockMusicProvider(tools: MediaTools): MusicProvider {
  return {
    name: "mock",
    estimateCostCents: () => 0,
    async generate(input: MusicInput, workDir: string): Promise<MusicResult> {
      await new Promise((r) => setTimeout(r, num("MOCK_MUSIC_DELAY_MS", 2000)));
      if (Math.random() < num("MOCK_MUSIC_FAILURE_RATE", 0))
        throw new Error("Mock-Musikanbieter: simulierter Ausfall");

      const durationS = num("MOCK_MUSIC_DURATION_S", input.targetDurationS);
      // Aufbau proportional zur Länge: Intro 10 %, danach Strophe/Refrain im Wechsel
      const at = (p: number) => Math.round(durationS * p * 1000);
      const sections = [
        { label: "intro", startMs: 0, endMs: at(0.1) },
        { label: "verse", startMs: at(0.1), endMs: at(0.3) },
        { label: "chorus", startMs: at(0.3), endMs: at(0.45) },
        { label: "verse", startMs: at(0.45), endMs: at(0.65) },
        { label: "chorus", startMs: at(0.65), endMs: at(0.8) },
        { label: "bridge", startMs: at(0.8), endMs: at(0.88) },
        { label: "chorus", startMs: at(0.88), endMs: at(1) },
      ];
      const file = path.join(workDir, `mock-${randomUUID()}.mp3`);
      const mode = process.env.MOCK_MUSIC_MODE === "silent" ? "silent" : "normal";
      await generateTestSong(tools, file, { durationS, introS: durationS * 0.1, mode });
      return { file, format: "mp3", sections, providerJobId: null, model: "mock" };
    },
  };
}
