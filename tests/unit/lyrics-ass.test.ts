// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildLyricsAss, fontFamilyFor } from "@/media/lyrics-ass";
import { timedLinesFrom } from "@/music/mureka";

describe("Songtext im Video (C3)", () => {
  it("liest Zeilen und Wörter mit Zeiten aus der Mureka-Antwort", () => {
    const lines = timedLinesFrom({
      lyrics_sections: [
        {
          section_type: "chorus",
          lines: [
            {
              start: 5000,
              end: 7000,
              text: "Happy Birthday, Anna",
              words: [{ start: 5000, end: 5600, text: "Happy" }],
            },
            { start: 1000, end: 3000, text: "Erste Zeile" },
            { start: 9000, end: 8000, text: "kaputt" },
          ],
        },
      ],
    });
    expect(lines?.map((l) => l.text)).toEqual(["Erste Zeile", "Happy Birthday, Anna"]);
    expect(lines?.[1]?.words).toEqual([{ startMs: 5000, endMs: 5600, text: "Happy" }]);
    expect(timedLinesFrom({})).toBeNull();
  });

  it("baut Untertitel mit Karaoke-Füllung, nächster Zeile und entschärften Sonderzeichen", () => {
    const ass = buildLyricsAss(
      [
        {
          startMs: 2000,
          endMs: 4000,
          text: "Heute ist dein Tag",
          words: [
            { startMs: 2000, endMs: 2500, text: "Heute" },
            { startMs: 2500, endMs: 4000, text: "Tag" },
          ],
        },
        { startMs: 4200, endMs: 6000, text: "mit {Klammern}" },
      ],
      { width: 1080, height: 1920, fontFamily: "DejaVu Sans", songDurationMs: 10_000 },
    );
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("Dialogue: 1,0:00:01.75,0:00:03.95,Current");
    expect(ass).toContain(String.raw`{\kf50}Heute {\kf150}Tag`);
    expect(ass).toContain(String.raw`Next,,0,0,0,,{\an5\pos(540,1150)}mit (Klammern)`);
    expect(ass).not.toContain("{Klammern}");
  });

  it("erkennt den Schriftnamen aus der Schriftdatei", () => {
    expect(fontFamilyFor("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")).toBe("DejaVu Sans");
    expect(fontFamilyFor("C:/Windows/Fonts/arialbd.ttf")).toBe("Arial");
  });
});
