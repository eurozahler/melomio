import { describe, expect, it } from "vitest";
import { SETTINGS, SETTING_KEYS, validateSetting } from "@/db/settings";

describe("Einstellungen", () => {
  it("jeder Standardwert erfüllt seine eigenen Regeln", () => {
    for (const key of SETTING_KEYS) {
      expect(() => validateSetting(key, SETTINGS[key].default)).not.toThrow();
    }
  });

  it("Standardwerte entsprechen den Entscheidungen (E4, E12, F-18)", () => {
    expect(SETTINGS.preview_duration_s.default).toBe(20);
    expect(SETTINGS.previews_per_account.default).toBe(1);
    expect(SETTINGS.lyrics_ai_revisions_free.default).toBe(1);
    expect(SETTINGS.music_candidates_before_purchase.default).toBe(1);
    expect(SETTINGS.song_target_duration_s.default).toBe(180);
  });

  it("lehnt ungültige Werte ab", () => {
    expect(() => validateSetting("preview_duration_s", 0)).toThrow();
    expect(() => validateSetting("preview_duration_s", "20")).toThrow();
    expect(() => validateSetting("lyrics_ai_revisions_free", 1.5)).toThrow();
  });
});
