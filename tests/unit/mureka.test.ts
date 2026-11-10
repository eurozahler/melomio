// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMurekaMusicProvider, toMurekaLyrics, toMurekaPrompt } from "@/music/mureka";
import type { MusicInput } from "@/music/types";

const INPUT: MusicInput = {
  lyrics: {
    title: "Für Anna",
    sections: [
      { type: "verse", lines: ["Heute ist dein Tag, liebe Anna", "die Sonne lacht für dich"] },
      { type: "chorus", lines: ["Happy Birthday, Anna"] },
    ],
  },
  genreHint: "modern German pop",
  moodHint: "joyful",
  voiceHint: "soft female vocals",
  language: "de",
  targetDurationS: 90,
};

type Call = { url: string; init?: RequestInit };

/** Simulierte Mureka-Schnittstelle: Auftrag → 2× „running“ → „succeeded“ → MP3. */
function fakeMureka(final: Record<string, unknown>) {
  const calls: Call[] = [];
  let polls = 0;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith("/v1/song/generate")) return json({ id: "task-1", status: "preparing", model: "mureka-9.5" });
    if (u.includes("/v1/song/query/task-1")) {
      polls++;
      return json(polls < 3 ? { id: "task-1", status: "running" } : { id: "task-1", model: "mureka-9.5", ...final });
    }
    if (u === "https://cdn.mureka.ai/song.mp3") return new Response(new Uint8Array([1, 2, 3]));
    return json({ error: { message: "unbekannt" } }, 404);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "mureka-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("Mureka-Musikbaustein", () => {
  it("baut Songtext und Stilbeschreibung im Mureka-Format", () => {
    expect(toMurekaLyrics(INPUT.lyrics)).toBe(
      "[Verse]\nHeute ist dein Tag, liebe Anna\ndie Sonne lacht für dich\n\n[Chorus]\nHappy Birthday, Anna",
    );
    expect(toMurekaPrompt(INPUT)).toBe("modern German pop, joyful, soft female vocals, sung in German, clear German pronunciation");
  });

  it("startet den Auftrag, fragt bis zum Ergebnis ab und lädt die MP3 herunter", async () => {
    const { fetch, calls } = fakeMureka({
      status: "succeeded",
      choices: [
        {
          id: "song-7",
          url: "https://cdn.mureka.ai/song.mp3",
          lyrics_sections: [
            { section_type: "verse", start: 5000, end: 30000 },
            { section_type: "chorus", start: 30000, end: 50000 },
          ],
        },
      ],
    });
    const provider = createMurekaMusicProvider("geheim", { fetch, sleep: async () => {}, costCents: 7 });
    const result = await provider.generate(INPUT, dir);

    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body).toMatchObject({ model: "mureka-9.5", n: 1, gender: "female", duration: 120 });
    expect(body.lyrics).toContain("[Chorus]");
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe("Bearer geheim");
    expect(calls.filter((c) => c.url.includes("/query/")).length).toBe(3);

    expect(await readFile(result.file)).toEqual(Buffer.from([1, 2, 3]));
    expect(result.sections).toEqual([
      { label: "verse", startMs: 5000, endMs: 30000 },
      { label: "chorus", startMs: 30000, endMs: 50000 },
    ]);
    expect(result.providerJobId).toBe("task-1/song-7");
    expect(provider.estimateCostCents(INPUT)).toBe(7);
  });

  it("meldet einen fehlgeschlagenen Auftrag mit Grund", async () => {
    const { fetch } = fakeMureka({ status: "failed", failed_reason: "content policy" });
    const provider = createMurekaMusicProvider("geheim", { fetch, sleep: async () => {} });
    await expect(provider.generate(INPUT, dir)).rejects.toThrow(/failed – content policy/);
  });

  it("übersetzt Fehlercodes in verständliche Hinweise", async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 })) as typeof globalThis.fetch;
    const provider = createMurekaMusicProvider("geheim", { fetch });
    await expect(provider.generate(INPUT, dir)).rejects.toThrow(/HTTP 429 \(zu viele gleichzeitige Aufträge oder Guthaben aufgebraucht\)/);
  });

  it("schickt bei Modellen ohne Längensteuerung keine Ziellänge mit", async () => {
    const { fetch, calls } = fakeMureka({ status: "succeeded", choices: [{ url: "https://cdn.mureka.ai/song.mp3" }] });
    const provider = createMurekaMusicProvider("geheim", { fetch, sleep: async () => {}, model: "mureka-o2" });
    const result = await provider.generate(INPUT, dir);
    expect(JSON.parse(String(calls[0]!.init!.body)).duration).toBeUndefined();
    expect(result.sections).toBeNull();
  });
});
