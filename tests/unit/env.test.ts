import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "@/config/env";

const DB = "postgres://user:pw@localhost:5433/melomio_dev";

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
    const env = parseEnv({ DATABASE_URL: DB });
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
    const problems = problemsOf({ DATABASE_URL: DB, PAYMENT_PROVIDER: "paypal" });
    expect(problems.join("\n")).toMatch(/PAYMENT_PROVIDER: ungültiger Wert "paypal"\. Erlaubt: mock, mollie/);
  });

  it("lehnt eine DATABASE_URL ohne postgres:// ab", () => {
    const problems = problemsOf({ DATABASE_URL: "mysql://x" });
    expect(problems.join("\n")).toMatch(/DATABASE_URL: muss mit postgres:\/\//);
  });

  it("verlangt den Mollie-Schlüssel, wenn Mollie gewählt ist", () => {
    const problems = problemsOf({ DATABASE_URL: DB, PAYMENT_PROVIDER: "mollie" });
    expect(problems).toContain("MOLLIE_API_KEY: fehlt (nötig wegen PAYMENT_PROVIDER=mollie)");
  });

  it("lehnt noch nicht gebaute Musik-Adapter ab", () => {
    const problems = problemsOf({ DATABASE_URL: DB, MUSIC_PROVIDER: "acestep" });
    expect(problems.join("\n")).toMatch(/noch nicht umgesetzt/);
  });
});

describe("Startsperre für den Livemodus (Abnahmekriterium M1)", () => {
  it("APP_MODE=live mit einem Mock-Provider startet NICHT", () => {
    const problems = problemsOf({ DATABASE_URL: DB, APP_MODE: "live" });
    expect(problems.some((p) => p.startsWith("Startsperre") && p.includes("PAYMENT_PROVIDER=mock"))).toBe(
      true,
    );
  });

  it("APP_MODE=live mit Mollie-Testschlüssel startet NICHT", () => {
    const problems = problemsOf({
      DATABASE_URL: DB,
      APP_MODE: "live",
      PAYMENT_PROVIDER: "mollie",
      MOLLIE_API_KEY: "test_abc",
    });
    expect(problems.join("\n")).toMatch(/Mollie-Testschlüssel/);
  });

  it("APP_MODE=test mit Mollie-Liveschlüssel startet NICHT (kein echtes Geld im Testbetrieb)", () => {
    const problems = problemsOf({
      DATABASE_URL: DB,
      PAYMENT_PROVIDER: "mollie",
      MOLLIE_API_KEY: "live_abc",
    });
    expect(problems.join("\n")).toMatch(/Mollie-Liveschlüssel/);
  });

  it("vollständige Livekonfiguration ohne Mocks startet und zeigt kein Banner", () => {
    const env = parseEnv({
      DATABASE_URL: DB,
      APP_MODE: "live",
      PAYMENT_PROVIDER: "mollie",
      MOLLIE_API_KEY: "live_abc",
      LYRICS_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-x",
      MUSIC_PROVIDER: "elevenlabs",
      ELEVENLABS_API_KEY: "el-x",
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
      DATABASE_URL: DB,
      PAYMENT_PROVIDER: "mollie",
      MOLLIE_API_KEY: "test_abc",
    });
    expect(env.isTestOperation).toBe(true);
  });
});
