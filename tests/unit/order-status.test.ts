import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  IllegalTransitionError,
  ORDER_STATUSES,
  TRANSITIONS,
} from "@/domain/order-status";

describe("Statusmaschine der Bestellung (Abnahme M4)", () => {
  it("jeder Status hat einen Eintrag, alle Ziele sind gültige Status", () => {
    for (const s of ORDER_STATUSES) {
      expect(TRANSITIONS[s]).toBeDefined();
      for (const to of TRANSITIONS[s]) expect(ORDER_STATUSES).toContain(to);
    }
  });

  it("der normale Weg ist vollständig erlaubt", () => {
    const happyPath = [
      "created",
      "lyrics_generating",
      "lyrics_review",
      "lyrics_approved",
      "music_generating",
      "preview_ready",
      "awaiting_payment",
      "paid",
      "video_rendering",
      "completed",
    ] as const;
    for (let i = 0; i < happyPath.length - 1; i++) {
      const from = happyPath[i]!;
      const to = happyPath[i + 1]!;
      expect(() => assertTransition(from, to, { paid: i >= 6 })).not.toThrow();
    }
  });

  it("lehnt Sprünge ab, z. B. unbezahlt → Songtext oder Hörprobe → Video", () => {
    expect(canTransition("awaiting_payment", "lyrics_generating")).toBe(false);
    expect(() => assertTransition("preview_ready", "video_rendering", { paid: false })).toThrow(
      IllegalTransitionError,
    );
    expect(() => assertTransition("created", "paid", { paid: false })).toThrow(IllegalTransitionError);
  });

  it("Video nur nach bestätigter Zahlung – auch auf erlaubten Wegen", () => {
    expect(() => assertTransition("music_generating", "video_rendering", { paid: false })).toThrow(
      /Zahlung ist nicht bestätigt/,
    );
    expect(() => assertTransition("music_generating", "video_rendering", { paid: true })).not.toThrow();
  });

  it("Endzustände lassen keinen Übergang mehr zu", () => {
    for (const end of ["refunded", "canceled", "preview_expired"] as const) {
      expect(TRANSITIONS[end]).toEqual([]);
    }
  });

  it("die Zahlung kann nur aus „wartet auf Zahlung“ bestätigt werden", () => {
    const sources = ORDER_STATUSES.filter((s) => canTransition(s, "paid"));
    expect(sources.sort()).toEqual(["awaiting_payment", "failed"]);
  });
});

describe("Status „bezahlt“", () => {
  it("lässt sich ohne bestätigte Zahlung nicht setzen – auch nicht per Neuversuch aus „Fehler“", () => {
    expect(() => assertTransition("awaiting_payment", "paid", { paid: false })).toThrow(/Zahlung/);
    expect(() => assertTransition("failed", "paid", { paid: false })).toThrow(/Zahlung/);
    expect(() => assertTransition("failed", "paid", { paid: true })).not.toThrow();
  });
});
