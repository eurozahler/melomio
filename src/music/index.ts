import type { AppEnv } from "@/config/env";
import type { MediaTools } from "@/media/ffmpeg";
import { createMockMusicProvider } from "./mock";
import type { MusicProvider } from "./types";

export * from "./types";

/** Wählt den Musik-Baustein laut Konfiguration (MUSIC_PROVIDER). Echte Anbieter erst nach Lizenzklärung (W3). */
export function getMusicProvider(env: Pick<AppEnv, "MUSIC_PROVIDER">, tools: MediaTools): MusicProvider {
  if (env.MUSIC_PROVIDER === "mock") return createMockMusicProvider(tools);
  throw new Error(`MUSIC_PROVIDER=${env.MUSIC_PROVIDER} ist noch nicht umgesetzt (Lizenzfrage offen, F-2)`);
}

export function mediaToolsFromEnv(env: Pick<AppEnv, "FFMPEG_PATH" | "FFPROBE_PATH">): MediaTools {
  return { ffmpeg: env.FFMPEG_PATH, ffprobe: env.FFPROBE_PATH };
}
