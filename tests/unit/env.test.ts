import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "@/config/env";

const DB = "postgres://user:pw@localhost:5433/melomio_dev";
/** Pflichtangaben, die in jeder Konfiguration vorhanden sein müssen. */
const BASE = { DATABASE_URL: DB, APP_BASE_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "s".repeat(32) };

/** Hilfsfunktion: erwartet einen Konfigurationsfehler und liefert dessen Problemliste. */
function problemsOf(raw: Record<string, string | undefined>): string[] {
  try {
    parseEnv(raw);
  } catch (e) {
    expect(e).toBeInstanceOf(EnvError);
    return (e as EnvError).problems;
  }
  throw new Error("Es wurde ein Konfigurationsfehler erwartet, aber keiner ausgelöst");
}

describe("Umgebungsvariablen – Grundfälle", () => {
  it("startet mit minimaler Konfiguration im Testbetrieb (alles Mocks)", () => {
    const env = parseEnv({ ...BASE });
    expect(env.APP_MODE).toBe("test");
    expect(env.PAYMENT_PROVIDER).toBe("mock");
    expect(env.isTestOperation).toBe(true);
    expect(env.activeMocks).toContain("PAYMENT_PROVIDER=mock");
  });

  it("meldet eine fehlende DATABASE_URL verständlich auf Deutsch", () => {
    const problems = problemsOf({});
    expect(problems).toContain("DATABASE_URL: fehlt");
  });

  it("die Fehlermeldung nennt .env.example und .env.local", () => {
    expect(() => parseEnv({})).toThrowError(/\.env\.example[\s\S]*\.env\.local/);
  });

  it("meldet ungültige Werte mit den erlaubten Alternativen", () => {
    const problems = problemsOf({ ...BASE, PAYMENT_PROVIDER: "paypal" });
    expect(problems.join("\n")).toMatch(/PAYMENT_PROVIDER: ungültiger Wert "paypal"\. Erlaubt: mock, mollie/);
  });

  it("lehnt eine DATABASE_URL ohne postgres:// ab", () => {
    const problems = problemsOf({ ...BASE, DATABASE_URL: "mysql://x" });
    expect(problems.join("\n")).toMatch(/DATABASE_URL: muss mit postgres:\/\//);
  });

  it("verlangt den Mollie-Schlüssel, wenn Mollie gewählt ist", () => {
    const problems = problemsOf({ ...BASE, PAYMENT_PROVIDER: "mollie" });
    expect(problems).toContain("MOLLIE_API_KEY: fehlt (nötig wegen PAYMENT_PROVIDER=mollie)");
  });

  it("lehnt noch nicht gebaute Musik-Adapter ab", () => {
    const problems = problemsOf({ ...BASE, MUSIC_PROVIDER: "acestep" });
    expect(problems.join("\n")).toMatch(/noch nicht umgesetzt/);
  });
});

describe("Anmeldung: Adresse und geheimer Schlüssel", () => {
  it("verlangt APP_BASE_URL und BETTER_AUTH_SECRET", () => {
    const problems = problemsOf({ DATABASE_URL: DB });
    expect(problems).toContain("APP_BASE_URL: fehlt");
    expect(problems).toContain("BETTER_AUTH_SECRET: fehlt");
  });

  it("lehnt einen zu kurzen geheimen Schlüssel ab", () => {
    const problems = problemsOf({ ...BASE, BETTER_AUTH_SECRET: "kurz" });
    expect(problems.join("\n")).toMatch(/BETTER_AUTH_SECRET: muss mindestens 32 Zeichen/);
  });

  it("lehnt eine Adresse mit Pfad ab", () => {
    const problems = problemsOf({ ...BASE, APP_BASE_URL: "http://localhost:3000/shop" });
    expect(problems.join("\n")).toMatch(/APP_BASE_URL: muss eine Adresse ohne Pfad sein/);
  });

  it("Schutz gegen zu viele Anmeldeversuche ist im Livebetrieb Pflicht", () => {
    const problems = problemsOf({ ...BASE, APP_MODE: "live", AUTH_RATE_LIMIT: "off" });
    expect(problems.join("\n")).toMatch(/AUTH_RATE_LIMIT=off ist im Livebetrieb nicht erlaubt/);
    expect(parseEnv({ ...BASE }).AUTH_RATE_LIMIT).toBe("on");
  });

  it("Livebetrieb verlangt https", () => {
    const problems = problemsOf({ ...BASE, APP_MODE: "live" });
    expect(problems.join("\n")).toMatch(/verlangt eine APP_BASE_URL mit https/);
  });
});

describe("Startsperre für den Livemodus (Abnahmekriterium M1)", () => {
  it("APP_MODE=live mit einem Mock-Provider startet NICHT", () => {
    const problems = problemsOf({ ...BASE, APP_MODE: "live" });
    expect(problems.some((p) => p.startsWith("Startsperre") && p.includes("PAYMENT_PROVIDER=mock"))).toBe(
      true,
    );
  });

  it("APP_MODE=live mit Mollie-Testschlüssel startet NICHT", () => {
    const problems = problemsOf({
      ...BASE,
      APP_MODE: "live",
      PAYMENT_PROVIDER: "mollie",
      MOLLIE_API_KEY: "test_abc",
    });
    expect(problems.join("\n")).toMatch(/Mollie-Testschlüssel/);
  });

  it("APP_MODE=test mit Mollie-Liveschlüssel startet NICHT (kein echtes Geld im Testbetrieb)", () => {
    const problems = problemsOf({
      ...BASE,
      PAYMENT_PROVIDER: "mollie",
      MOLLIE_API_KEY: "live_abc",
    });
    expect(problems.join("\n")).toMatch(/Mollie-Liveschlüssel/);
  });

  it("vollständige Livekonfiguration ohne Mocks startet und zeigt kein Banner", () => {
    const env = parseEnv({
      ...BASE,
      APP_BASE_URL: "https://melomio.de",
      APP_MODE: "live",
      PAYMENT_PROVIDER: "mollie",
      MOLLIE_API_KEY: "live_abc",
      LYRICS_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-x",
      MUSIC_PROVIDER: "mureka",
      MUREKA_API_KEY: "mk-x",
      EMAIL_PROVIDER: "smtp",
      SMTP_HOST: "smtp.strato.de",
      SMTP_PORT: "465",
      SMTP_USER: "songs@melomio.de",
      SMTP_PASSWORD: "x",
      SMTP_FROM: "songs@melomio.de",
      STORAGE_PROVIDER: "s3",
      S3_ENDPOINT: "https://example.invalid",
      S3_REGION: "eu-central",
      S3_BUCKET: "melomio",
      S3_ACCESS_KEY_ID: "a",
      S3_SECRET_ACCESS_KEY: "b",
    });
    expect(env.isTestOperation).toBe(false);
    expect(env.activeMocks).toEqual([]);
  });

  it("Testbetrieb mit echten Adaptern zeigt trotzdem das Banner", () => {
    const env = parseEnv({
      ...BASE,
      PAYMENT_PROVIDER: "mollie",
      MOLLIE_API_KEY: "test_abc",
    });
    expect(env.isTestOperation).toBe(true);
  });
});

describe("Werkzeuge und Speicher", () => {
  it("leere Angaben aus der Vorlage führen zu den Standardwerten", () => {
    const env = parseEnv({ ...BASE, FFMPEG_PATH: "", FFPROBE_PATH: "", STORAGE_LOCAL_DIR: "" });
    expect(env.FFMPEG_PATH).toBe("ffmpeg");
    expect(env.FFPROBE_PATH).toBe("ffprobe");
    expect(env.STORAGE_LOCAL_DIR).toBe("storage");
  });
});
