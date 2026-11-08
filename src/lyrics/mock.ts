import type { Lyrics, LyricsInput, LyricsProvider, LyricsRevision, LyricsResult } from "./types";

/**
 * Test-Baustein (Mock): baut ohne KI und ohne Kosten einen deutschen Beispieltext aus den Antworten.
 * Gut erkennbar als Testtext. Gleiche Eingabe → gleicher Text (für Tests).
 */

function firstSentence(text: string, max = 60): string {
  const s = text.split(/[.!?\n]/)[0]?.trim() ?? "";
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function build(input: LyricsInput, variant: number): Lyrics {
  const name = input.recipientName ?? "du";
  const details = input.answers
    .filter((a) => a.answer.length > 12)
    .map((a) => firstSentence(a.answer))
    .filter(Boolean);
  const detailA = details[0] ?? "Du bist einfach wunderbar";
  const detailB = details[1] ?? "Wir haben so viel erlebt";
  const mood = input.mood?.name.toLowerCase() ?? "fröhlich";

  const verse1 = [
    `Heute ist ein ganz besonderer Tag`,
    `${input.occasion} – und wir sind alle da`,
    detailA,
    `Darum singen wir für ${name}, ganz klar`,
  ];
  const chorus = [
    `${name}, das ist dein Lied`,
    `Ein bisschen ${mood}, so wie es dir gefällt`,
    `${name}, weil es dich gibt`,
    `Bist du das Schönste auf der Welt`,
  ];
  const verse2 = [
    `Weißt du noch, wie alles begann?`,
    detailB,
    `Jeder Moment mit dir zählt`,
    `Und dieser Song erzählt davon`,
  ];
  const bridge = [`Und wenn die Musik verklingt`, `Bleibt dieser Moment bestehen`];

  if (variant > 0) {
    verse1.reverse();
    verse2.reverse();
  }
  return {
    title: variant > 0 ? `Für ${name} (neue Fassung ${variant})` : `Für ${name}`,
    sections: [
      { type: "verse", lines: verse1 },
      { type: "chorus", lines: chorus },
      { type: "verse", lines: verse2 },
      { type: "chorus", lines: chorus },
      { type: "bridge", lines: bridge },
      { type: "chorus", lines: chorus },
    ],
  };
}

export const mockLyricsProvider: LyricsProvider = {
  name: "mock",
  async generate(input: LyricsInput): Promise<LyricsResult> {
    return { ...build(input, 0), model: "mock" };
  },
  async revise(input: LyricsInput, revision: LyricsRevision): Promise<LyricsResult> {
    const match = /neue Fassung (\d+)/.exec(revision.previous.title);
    const variant = (match ? Number(match[1]) : 0) + 1;
    return { ...build(input, variant), model: "mock" };
  },
};
