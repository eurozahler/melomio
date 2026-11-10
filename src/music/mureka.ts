import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { MusicSection } from "@/db/schema";
import type { Lyrics } from "@/lyrics/types";
import type { MusicInput, MusicProvider, MusicResult } from "./types";

/**
 * Musik mit Mureka (https://platform.mureka.ai, Stand der Doku: 10.11.2026). Kostenpflichtig –
 * wird nur mit MUSIC_PROVIDER=mureka und gesetztem MUREKA_API_KEY verwendet.
 *
 * Ablauf: POST /v1/song/generate (Songtext + Stilbeschreibung) → Auftragsnummer →
 * GET /v1/song/query/{id} abfragen, bis „succeeded“ → MP3 herunterladen.
 * Mureka liefert Abschnittszeiten (Strophe, Refrain …) mit – die nutzen wir für die Hörprobe.
 * Laut FAQ: Inhalte aus bezahlten API-Aufrufen dürfen kommerziell genutzt werden
 * (vor dem Livegang in den Nutzungsbedingungen bestätigen, F-2).
 */

export const MUREKA_BASE_URL = "https://api.mureka.ai";
export const MUREKA_DEFAULT_MODEL = "mureka-9.5";

const LYRICS_MAX = 5000;
const PROMPT_MAX = 1024;
/** Nur mureka-9.5 kennt eine Ziellänge, erlaubt sind 120–300 Sekunden. */
const DURATION_MODELS = new Set(["mureka-9.5"]);

const SECTION_TAGS: Record<Lyrics["sections"][number]["type"], string> = {
  intro: "Intro",
  verse: "Verse",
  chorus: "Chorus",
  bridge: "Bridge",
  outro: "Outro",
};

/** Songtext im Mureka-Format: Abschnitte mit [Verse], [Chorus] … */
export function toMurekaLyrics(lyrics: Lyrics): string {
  const text = lyrics.sections
    .map((s) => `[${SECTION_TAGS[s.type]}]\n${s.lines.join("\n")}`)
    .join("\n\n");
  if (text.length > LYRICS_MAX) throw new Error(`Songtext zu lang für Mureka (${text.length} > ${LYRICS_MAX} Zeichen)`);
  return text;
}

/** Stilbeschreibung (Englisch) aus Genre, Stimmung, Stimme – plus der Hinweis auf deutschen Gesang. */
export function toMurekaPrompt(input: MusicInput): string {
  return [input.genreHint, input.moodHint, input.voiceHint, "sung in German, clear German pronunciation"]
    .filter(Boolean)
    .join(", ")
    .slice(0, PROMPT_MAX);
}

function genderOf(voiceHint: string | null): "male" | "female" | undefined {
  if (!voiceHint) return undefined;
  if (/\bfemale\b/i.test(voiceHint)) return "female";
  if (/\bmale\b/i.test(voiceHint)) return "male";
  return undefined;
}

type MurekaSong = {
  id?: string;
  url?: string;
  duration?: number;
  lyrics_sections?: Array<{ section_type?: string; start?: number; end?: number }>;
};
type MurekaTask = {
  id?: string;
  model?: string;
  status?: string;
  failed_reason?: string;
  choices?: MurekaSong[];
};

const FINAL_FAILURES = new Set(["failed", "timeouted", "cancelled"]);

export type MurekaOptions = {
  model?: string;
  /** Geschätzte Kosten pro Song in Cent (für Tagesbudget und Auswertung). */
  costCents?: number;
  pollIntervalMs?: number;
  timeoutMs?: number;
  /** Nur für Tests: ersetzt die Netzwerkverbindung, damit keine echten (kostenpflichtigen) Aufrufe entstehen. */
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
};

export function createMurekaMusicProvider(apiKey: string, options: MurekaOptions = {}): MusicProvider {
  const model = options.model ?? MUREKA_DEFAULT_MODEL;
  const doFetch = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;

  async function call(pathname: string, init?: RequestInit): Promise<MurekaTask> {
    const res = await doFetch(`${MUREKA_BASE_URL}${pathname}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as MurekaTask & { error?: { message?: string } };
    if (!res.ok) {
      const hint =
        res.status === 401 ? " (API-Schlüssel ungültig)"
        : res.status === 403 ? " (Region nicht unterstützt)"
        : res.status === 429 ? " (zu viele gleichzeitige Aufträge oder Guthaben aufgebraucht)"
        : "";
      throw new Error(`Mureka: HTTP ${res.status}${hint}: ${body.error?.message ?? "unbekannter Fehler"}`);
    }
    return body;
  }

  return {
    name: "mureka",
    // Gemessen am 10.11.2026: 0,15 $ pro Song (mureka-9.5, Trial-Paket) ≈ 14 Cent
    estimateCostCents: () => options.costCents ?? 14,

    async generate(input: MusicInput, workDir: string): Promise<MusicResult> {
      const request: Record<string, unknown> = {
        lyrics: toMurekaLyrics(input.lyrics),
        model,
        prompt: toMurekaPrompt(input),
        n: 1, // abgerechnet wird pro Song
      };
      const gender = genderOf(input.voiceHint);
      if (gender) request.gender = gender;
      if (DURATION_MODELS.has(model)) request.duration = Math.min(300, Math.max(120, input.targetDurationS));

      const started = await call("/v1/song/generate", { method: "POST", body: JSON.stringify(request) });
      if (!started.id) throw new Error("Mureka: keine Auftragsnummer erhalten");
      const taskId = started.id;

      const deadline = Date.now() + timeoutMs;
      let task = started;
      while (task.status !== "succeeded") {
        if (task.status && FINAL_FAILURES.has(task.status))
          throw new Error(`Mureka-Auftrag ${taskId}: ${task.status}${task.failed_reason ? ` – ${task.failed_reason}` : ""}`);
        if (Date.now() > deadline) throw new Error(`Mureka-Auftrag ${taskId}: keine Antwort nach ${timeoutMs / 60_000} Minuten`);
        await sleep(pollIntervalMs);
        task = await call(`/v1/song/query/${encodeURIComponent(taskId)}`);
      }

      const song = task.choices?.[0];
      if (!song?.url || !/^https:\/\//.test(song.url)) throw new Error(`Mureka-Auftrag ${taskId}: keine Audio-Adresse`);
      const audio = await doFetch(song.url, { signal: AbortSignal.timeout(120_000) });
      if (!audio.ok) throw new Error(`Mureka-Auftrag ${taskId}: Download fehlgeschlagen (HTTP ${audio.status})`);
      const file = path.join(workDir, `mureka-${randomUUID()}.mp3`);
      await writeFile(file, Buffer.from(await audio.arrayBuffer()));

      const sections: MusicSection[] | null =
        song.lyrics_sections
          ?.filter((s) => s.section_type && typeof s.start === "number" && typeof s.end === "number")
          .map((s) => ({ label: s.section_type!, startMs: s.start!, endMs: s.end! })) ?? null;

      return {
        file,
        format: "mp3",
        sections: sections?.length ? sections : null,
        providerJobId: song.id ? `${taskId}/${song.id}` : taskId,
        model: task.model ?? model,
      };
    },
  };
}
