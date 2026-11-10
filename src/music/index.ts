import type { AppEnv } from "@/config/env";
import type { MediaTools } from "@/media/ffmpeg";
import { createMockMusicProvider } from "./mock";
import { createMurekaMusicProvider } from "./mureka";
import type { MusicProvider } from "./types";

export * from "./types";

/** Wählt den Musik-Baustein laut Konfiguration (MUSIC_PROVIDER). */
export function getMusicProvider(
  env: Pick<AppEnv, "MUSIC_PROVIDER" | "MUREKA_API_KEY" | "MUREKA_MODEL" | "MUREKA_COST_CENTS">,
  tools: MediaTools,
): MusicProvider {
  if (env.MUSIC_PROVIDER === "mock") return createMockMusicProvider(tools);
  if (env.MUSIC_PROVIDER === "mureka") {
    if (!env.MUREKA_API_KEY) throw new Error("MUREKA_API_KEY fehlt");
    return createMurekaMusicProvider(env.MUREKA_API_KEY, {
      model: env.MUREKA_MODEL,
      costCents: env.MUREKA_COST_CENTS,
    });
  }
  throw new Error(`MUSIC_PROVIDER=${env.MUSIC_PROVIDER} ist noch nicht umgesetzt`);
}

export function mediaToolsFromEnv(env: Pick<AppEnv, "FFMPEG_PATH" | "FFPROBE_PATH">): MediaTools {
  return { ffmpeg: env.FFMPEG_PATH, ffprobe: env.FFPROBE_PATH };
}
