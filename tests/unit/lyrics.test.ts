// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createAnthropicLyricsProvider } from "@/lyrics/anthropic";
import { filterInput } from "@/lyrics/filter";
import { mockLyricsProvider } from "@/lyrics/mock";
import { LYRICS_SYSTEM_PROMPT_V1 } from "@/lyrics/prompts";
import { LyricsRefusedError, lyricsSchema, type LyricsInput } from "@/lyrics/types";

const INPUT: LyricsInput = {
  occasion: "Geburtstag",
  answers: [
    { question: "Für wen ist der Song?", answer: "Anna" },
    { question: "Was macht diese Person besonders?", answer: "Sie lacht laut und liebt Kaffee am Morgen." },
  ],
  recipientName: "Anna",
  genre: { name: "Pop", hint: "modern German pop" },
  mood: { name: "Fröhlich", hint: "joyful" },
  voice: { name: "Warme Männerstimme", hint: "warm male vocals" },
  language: "de",
};

describe("Filter für Kundeneingaben", () => {
  it("entfernt Namen echter Künstler", () => {
    const r = filterInput("Sie hört gern Helene Fischer und tanzt dazu");
    expect(r.flagged).toBe(true);
    expect(r.text).not.toMatch(/Helene Fischer/);
  });

  it("entfernt „im Stil von …“ bis zum Satzende", () => {
    const r = filterInput("Bitte im Stil von irgendeiner Band. Sie liebt Hunde.");
    expect(r.flagged).toBe(true);
    expect(r.text).toBe("Bitte [entfernt]. Sie liebt Hunde.");
  });

  it("lässt normale Angaben unverändert", () => {
    expect(filterInput("Wir waren zusammen in Rom")).toEqual({
      text: "Wir waren zusammen in Rom",
      flagged: false,
    });
  });
});

describe("Test-Baustein (Mock)", () => {
  it("baut einen gültigen deutschen Songtext mit dem Namen", async () => {
    const r = await mockLyricsProvider.generate(INPUT, "", "mock");
    expect(lyricsSchema.safeParse(r).success).toBe(true);
    expect(r.title).toBe("Für Anna");
    expect(r.sections.map((s) => s.type)).toEqual(["verse", "chorus", "verse", "chorus", "bridge", "chorus"]);
    expect(JSON.stringify(r)).toContain("Sie lacht laut und liebt Kaffee am Morgen");
  });

  it("eine Neuformulierung liefert eine erkennbar neue Fassung", async () => {
    const first = await mockLyricsProvider.generate(INPUT, "", "mock");
    const second = await mockLyricsProvider.revise(INPUT, { previous: first, feedback: null }, "", "mock");
    expect(second.title).toBe("Für Anna (neue Fassung 1)");
  });
});

describe("Grenzen für Songtexte", () => {
  it("lehnt zu lange Zeilen und leere Abschnitte ab", () => {
    expect(
      lyricsSchema.safeParse({ title: "T", sections: [{ type: "verse", lines: ["x".repeat(121)] }] }).success,
    ).toBe(false);
    expect(lyricsSchema.safeParse({ title: "T", sections: [{ type: "verse", lines: [] }] }).success).toBe(
      false,
    );
    expect(lyricsSchema.safeParse({ title: "", sections: [{ type: "verse", lines: ["a"] }] }).success).toBe(
      false,
    );
  });
});

/** Attrappe der Anthropic-Schnittstelle: zeichnet die Anfrage auf und liefert eine vorbereitete Antwort. */
function fakeAnthropic(reply: Record<string, unknown>) {
  const calls: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
        ...reply,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { calls, fetchImpl };
}

const GOOD_LYRICS = {
  title: "Annas Lied",
  sections: [
    { type: "verse", lines: ["Zeile eins", "Zeile zwei"] },
    { type: "chorus", lines: ["Refrain eins", "Refrain zwei"] },
  ],
};

describe("Claude-Baustein (ohne echten Aufruf)", () => {
  it("sendet Modell, Rückfall-Option, gekennzeichnete Kundendaten und gecachten System-Prompt", async () => {
    const { calls, fetchImpl } = fakeAnthropic({
      content: [{ type: "text", text: JSON.stringify(GOOD_LYRICS) }],
      stop_reason: "end_turn",
    });
    const provider = createAnthropicLyricsProvider("sk-test", { fetch: fetchImpl });
    const result = await provider.generate(INPUT, LYRICS_SYSTEM_PROMPT_V1, "claude-opus-5-5");

    expect(result.title).toBe("Annas Lied");
    expect(result.model).toBe("claude-opus-5-5");
    expect(calls).toHaveLength(1);
    const { body, headers, url } = calls[0]!;
    expect(url).toContain("/v1/messages");
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.system).toEqual([
      { type: "text", text: LYRICS_SYSTEM_PROMPT_V1, cache_control: { type: "ephemeral" } },
    ]);
    const userText = JSON.stringify(body.messages);
    expect(userText).toContain("<kundenangaben>");
    expect(userText).toContain("Sie lacht laut");
    expect(userText).not.toMatch(/@/); // keine E-Mail-Adressen
  });

  it("eine Ablehnung des Modells wird als LyricsRefusedError gemeldet", async () => {
    const { fetchImpl } = fakeAnthropic({
      content: [],
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "general_harms", explanation: "x" },
    });
    const provider = createAnthropicLyricsProvider("sk-test", { fetch: fetchImpl });
    await expect(provider.generate(INPUT, "S", "claude-opus-5-5")).rejects.toBeInstanceOf(LyricsRefusedError);
  });

  it("ein Text außerhalb unserer Grenzen wird abgelehnt statt gespeichert", async () => {
    const { fetchImpl } = fakeAnthropic({
      content: [
        {
          type: "text",
          text: JSON.stringify({ title: "T", sections: [{ type: "verse", lines: ["x".repeat(500)] }] }),
        },
      ],
      stop_reason: "end_turn",
    });
    const provider = createAnthropicLyricsProvider("sk-test", { fetch: fetchImpl });
    await expect(provider.generate(INPUT, "S", "claude-opus-5-5")).rejects.toThrow(/Format/);
  });

  it("die Überarbeitung schickt den bisherigen Text und den Wunsch mit", async () => {
    const { calls, fetchImpl } = fakeAnthropic({
      content: [{ type: "text", text: JSON.stringify(GOOD_LYRICS) }],
      stop_reason: "end_turn",
    });
    const provider = createAnthropicLyricsProvider("sk-test", { fetch: fetchImpl });
    await provider.revise(
      INPUT,
      { previous: GOOD_LYRICS as never, feedback: "Mehr über Kaffee" },
      "S",
      "claude-opus-5-5",
    );
    const userText = JSON.stringify(calls[0]!.body.messages);
    expect(userText).toContain("<bisheriger_songtext>");
    expect(userText).toContain("Mehr über Kaffee");
  });
});
