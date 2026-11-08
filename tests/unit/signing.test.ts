// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSignedFilePath, verifySignedFile } from "@/delivery/signing";

const SECRET = "s".repeat(32);
const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);

function parts(path: string) {
  const url = new URL(path, "http://x");
  return { exp: url.searchParams.get("exp"), sig: url.searchParams.get("sig") };
}

describe("Signierte Datei-Links (Abnahme M9)", () => {
  it("ein frischer Link ist gültig", () => {
    const { exp, sig } = parts(createSignedFilePath(SECRET, "song", "M-ABC123", 60, NOW));
    expect(verifySignedFile(SECRET, "song", "M-ABC123", exp, sig, NOW)).toBe("ok");
  });

  it("ein abgelaufener Link funktioniert nicht", () => {
    const { exp, sig } = parts(createSignedFilePath(SECRET, "song", "M-ABC123", 60, NOW));
    expect(verifySignedFile(SECRET, "song", "M-ABC123", exp, sig, NOW + 61 * 60_000)).toBe("expired");
  });

  it("verlängern, umbiegen oder ohne Signatur – alles ungültig", () => {
    const { exp, sig } = parts(createSignedFilePath(SECRET, "song", "M-ABC123", 60, NOW));
    expect(verifySignedFile(SECRET, "song", "M-ABC123", String(Number(exp) + 3600), sig, NOW)).toBe(
      "invalid",
    );
    expect(verifySignedFile(SECRET, "video", "M-ABC123", exp, sig, NOW)).toBe("invalid");
    expect(verifySignedFile(SECRET, "song", "M-OTHER1", exp, sig, NOW)).toBe("invalid");
    expect(verifySignedFile(SECRET, "song", "M-ABC123", exp, null, NOW)).toBe("invalid");
    expect(verifySignedFile(SECRET, "song", "M-ABC123", "abc", sig, NOW)).toBe("invalid");
    expect(verifySignedFile("anderer-schluessel".repeat(3), "song", "M-ABC123", exp, sig, NOW)).toBe(
      "invalid",
    );
  });
});
