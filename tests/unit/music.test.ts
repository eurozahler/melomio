import { describe, expect, it } from "vitest";
import { choosePreviewStart } from "@/music/preview";
import { evaluateQuality } from "@/music/qc";

const TARGET = 180;
const ok = { decodable: true, durationMs: 180_000, silences: [], targetDurationS: TARGET };

describe("Qualitätsprüfung (Abnahme M6)", () => {
  it("ein normaler Song besteht", () => {
    expect(evaluateQuality(ok)).toEqual({ status: "passed", reasons: [] });
  });

  it("eine stumme Datei fällt durch", () => {
    const r = evaluateQuality({ ...ok, silences: [{ startMs: 0, endMs: 180_000 }] });
    expect(r.status).toBe("failed");
  });

  it("eine nicht lesbare Datei fällt durch", () => {
    expect(evaluateQuality({ ...ok, decodable: false }).status).toBe("failed");
  });

  it("viel zu kurz oder zu lang fällt durch, deutliche Abweichung geht zur manuellen Prüfung", () => {
    expect(evaluateQuality({ ...ok, durationMs: 60_000 }).status).toBe("failed");
    expect(evaluateQuality({ ...ok, durationMs: 400_000 }).status).toBe("failed");
    expect(evaluateQuality({ ...ok, durationMs: 120_000 }).status).toBe("manual");
    expect(evaluateQuality({ ...ok, durationMs: 200_000 }).status).toBe("passed");
  });

  it("Stille am Anfang und Ende ist normal, lange Stille in der Mitte nicht", () => {
    expect(
      evaluateQuality({
        ...ok,
        silences: [
          { startMs: 0, endMs: 2_500 },
          { startMs: 178_000, endMs: Number.POSITIVE_INFINITY },
        ],
      }).status,
    ).toBe("passed");
    expect(evaluateQuality({ ...ok, silences: [{ startMs: 60_000, endMs: 70_000 }] }).status).toBe("failed");
    expect(evaluateQuality({ ...ok, silences: [{ startMs: 60_000, endMs: 65_000 }] }).status).toBe("manual");
  });
});

describe("Startpunkt der Hörprobe (F-19)", () => {
  const sections = [
    { label: "intro", startMs: 0, endMs: 18_000 },
    { label: "verse", startMs: 18_000, endMs: 54_000 },
    { label: "chorus", startMs: 54_000, endMs: 81_000 },
  ];

  it("beginnt beim ersten Refrain, wenn der Anbieter Abschnitte liefert", () => {
    expect(choosePreviewStart({ durationMs: 180_000, previewMs: 20_000, sections, fallbackPct: 35 })).toEqual(
      {
        startMs: 54_000,
        method: "provider_sections",
      },
    );
  });

  it("nimmt sonst den Ersatzwert aus den Einstellungen", () => {
    expect(
      choosePreviewStart({ durationMs: 180_000, previewMs: 20_000, sections: null, fallbackPct: 35 }),
    ).toEqual({
      startMs: 63_000,
      method: "fallback",
    });
  });

  it("der Ausschnitt liegt immer vollständig im Song", () => {
    const late = [{ label: "chorus", startMs: 175_000, endMs: 180_000 }];
    expect(
      choosePreviewStart({ durationMs: 180_000, previewMs: 20_000, sections: late, fallbackPct: 35 }).startMs,
    ).toBe(160_000);
    expect(
      choosePreviewStart({ durationMs: 10_000, previewMs: 20_000, sections: null, fallbackPct: 35 }).startMs,
    ).toBe(0);
  });
});
