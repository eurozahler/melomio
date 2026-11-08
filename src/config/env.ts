import { z } from "zod";

/**
 * Prüfung der Umgebungsvariablen (siehe docs/ARCHITEKTUR.md, Abschnitte 4 und 5).
 *
 * - Alle Zugangsdaten kommen ausschließlich aus Umgebungsvariablen.
 * - Fehlt etwas oder ist etwas widersprüchlich, bricht der Start mit einer
 *   verständlichen deutschen Fehlermeldung ab.
 * - Startsperre: Im Livemodus dürfen keine Test-Adapter (Mocks) aktiv sein.
 */

export const APP_MODES = ["test", "live"] as const;
export const PAYMENT_PROVIDERS = ["mock", "mollie"] as const;
export const LYRICS_PROVIDERS = ["mock", "anthropic"] as const;
export const MUSIC_PROVIDERS = ["mock", "elevenlabs", "lyria", "mureka", "acestep"] as const;
export const EMAIL_PROVIDERS = ["console", "smtp"] as const;
export const STORAGE_PROVIDERS = ["local", "s3"] as const;

/** Adapter-Werte, die nur für den Testbetrieb gedacht sind. */
const TEST_ONLY_VALUES = new Set(["mock", "console", "local"]);

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const baseSchema = z.object({
  APP_MODE: z.enum(APP_MODES).default("test"),
  PAYMENT_PROVIDER: z.enum(PAYMENT_PROVIDERS).default("mock"),
  LYRICS_PROVIDER: z.enum(LYRICS_PROVIDERS).default("mock"),
  MUSIC_PROVIDER: z.enum(MUSIC_PROVIDERS).default("mock"),
  EMAIL_PROVIDER: z.enum(EMAIL_PROVIDERS).default("console"),
  STORAGE_PROVIDER: z.enum(STORAGE_PROVIDERS).default("local"),

  DATABASE_URL: z
    .string({ error: "fehlt" })
    .trim()
    .min(1, { error: "fehlt" })
    .refine((v) => /^postgres(ql)?:\/\//.test(v), {
      error: "muss mit postgres:// oder postgresql:// beginnen",
    }),
  DATABASE_URL_TEST: optionalString,

  /** Öffentliche Adresse der Webseite, z. B. https://melomio.de – wird in E-Mail-Links verwendet. */
  APP_BASE_URL: z
    .string({ error: "fehlt" })
    .trim()
    .min(1, { error: "fehlt" })
    .refine((v) => /^https?:\/\/[^/]+$/.test(v), {
      error: "muss eine Adresse ohne Pfad sein, z. B. http://localhost:3000 oder https://melomio.de",
    }),
  /** Geheimer Schlüssel zum Signieren der Anmelde-Cookies (mind. 32 Zeichen, zufällig). */
  BETTER_AUTH_SECRET: z
    .string({ error: "fehlt" })
    .min(32, { error: "muss mindestens 32 Zeichen lang sein (zufällig erzeugt)" }),

  /** Schutz gegen zu viele Anmeldeversuche. Nur für automatische Tests abschaltbar, nie im Livebetrieb. */
  AUTH_RATE_LIMIT: z.enum(["on", "off"]).default("on"),

  MOLLIE_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  ELEVENLABS_API_KEY: optionalString,

  SMTP_HOST: optionalString,
  SMTP_PORT: optionalString,
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM: optionalString,

  S3_ENDPOINT: optionalString,
  S3_REGION: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
});

type BaseEnv = z.infer<typeof baseSchema>;

/** Welche Variablen ein Adapter zusätzlich braucht. */
const REQUIRED_BY_ADAPTER: Array<{
  when: (e: BaseEnv) => boolean;
  label: string;
  keys: Array<keyof BaseEnv>;
}> = [
  {
    when: (e) => e.PAYMENT_PROVIDER === "mollie",
    label: "PAYMENT_PROVIDER=mollie",
    keys: ["MOLLIE_API_KEY"],
  },
  {
    when: (e) => e.LYRICS_PROVIDER === "anthropic",
    label: "LYRICS_PROVIDER=anthropic",
    keys: ["ANTHROPIC_API_KEY"],
  },
  {
    when: (e) => e.MUSIC_PROVIDER === "elevenlabs",
    label: "MUSIC_PROVIDER=elevenlabs",
    keys: ["ELEVENLABS_API_KEY"],
  },
  {
    when: (e) => e.EMAIL_PROVIDER === "smtp",
    label: "EMAIL_PROVIDER=smtp",
    keys: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"],
  },
  {
    when: (e) => e.STORAGE_PROVIDER === "s3",
    label: "STORAGE_PROVIDER=s3",
    keys: ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
  },
];

const PROVIDER_KEYS = [
  "PAYMENT_PROVIDER",
  "LYRICS_PROVIDER",
  "MUSIC_PROVIDER",
  "EMAIL_PROVIDER",
  "STORAGE_PROVIDER",
] as const;

/** Adapter, die noch nicht gebaut sind, dürfen nicht ausgewählt werden. */
const NOT_YET_IMPLEMENTED: Partial<Record<(typeof PROVIDER_KEYS)[number], string[]>> = {
  MUSIC_PROVIDER: ["lyria", "mureka", "acestep"],
};

export type AppEnv = BaseEnv & {
  /** true, wenn das Testbetrieb-Banner angezeigt werden muss. */
  isTestOperation: boolean;
  /** Liste der aktiven Test-Adapter, z. B. ["PAYMENT_PROVIDER=mock"]. */
  activeMocks: string[];
};

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(
      [
        "",
        "╔══ Konfigurationsfehler – die App startet nicht ══",
        ...problems.map((p) => `║  • ${p}`),
        "║",
        "║  Vorlage mit allen Variablen: .env.example",
        "║  Lokale Werte gehören in:     .env.local (nie in Git)",
        "╚══════════════════════════════════════════════════",
      ].join("\n"),
    );
    this.name = "EnvError";
  }
}

/**
 * Prüft die übergebenen Umgebungsvariablen.
 * Reine Funktion ohne Seiteneffekte, damit sie sich gut testen lässt.
 */
export function parseEnv(raw: Record<string, string | undefined>): AppEnv {
  const result = baseSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "(unbekannt)";
      if (issue.code === "invalid_value" && "values" in issue) {
        return `${key}: ungültiger Wert "${String(raw[key])}". Erlaubt: ${(issue.values as unknown[]).join(", ")}`;
      }
      return `${key}: ${issue.message}`;
    });
    throw new EnvError(problems);
  }

  const env = result.data;
  const problems: string[] = [];

  // 1. Zusatzvariablen der gewählten Adapter
  for (const rule of REQUIRED_BY_ADAPTER) {
    if (!rule.when(env)) continue;
    for (const key of rule.keys) {
      if (!env[key]) problems.push(`${key}: fehlt (nötig wegen ${rule.label})`);
    }
  }

  // 2. Noch nicht gebaute Adapter
  for (const key of PROVIDER_KEYS) {
    if (NOT_YET_IMPLEMENTED[key]?.includes(env[key])) {
      problems.push(`${key}=${env[key]}: dieser Adapter ist noch nicht umgesetzt`);
    }
  }

  const activeMocks = PROVIDER_KEYS.filter((k) => TEST_ONLY_VALUES.has(env[k])).map((k) => `${k}=${env[k]}`);

  // 3. Startsperre für den Livemodus
  if (env.APP_MODE === "live") {
    for (const mock of activeMocks) {
      problems.push(`Startsperre: APP_MODE=live ist mit dem Test-Adapter ${mock} nicht erlaubt`);
    }
    if (env.MOLLIE_API_KEY?.startsWith("test_")) {
      problems.push("Startsperre: APP_MODE=live ist mit einem Mollie-Testschlüssel (test_…) nicht erlaubt");
    }
  }

  // 3a. Schutz gegen zu viele Anmeldeversuche ist im Livebetrieb Pflicht
  if (env.APP_MODE === "live" && env.AUTH_RATE_LIMIT === "off") {
    problems.push("Startsperre: AUTH_RATE_LIMIT=off ist im Livebetrieb nicht erlaubt");
  }

  // 3b. Im Livebetrieb nur verschlüsselte Verbindungen
  if (env.APP_MODE === "live" && !env.APP_BASE_URL.startsWith("https://")) {
    problems.push("Startsperre: APP_MODE=live verlangt eine APP_BASE_URL mit https://");
  }

  // 4. Schutz vor echten Zahlungen im Testbetrieb
  if (env.APP_MODE === "test" && env.MOLLIE_API_KEY?.startsWith("live_")) {
    problems.push(
      "APP_MODE=test ist mit einem Mollie-Liveschlüssel (live_…) nicht erlaubt – im Testbetrieb darf kein echtes Geld fließen",
    );
  }

  if (problems.length > 0) throw new EnvError(problems);

  return {
    ...env,
    activeMocks,
    isTestOperation: env.APP_MODE === "test" || activeMocks.length > 0,
  };
}

let cached: AppEnv | undefined;

/** Geprüfte Konfiguration der laufenden App (wird einmal gelesen und gemerkt). */
export function getEnv(): AppEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
