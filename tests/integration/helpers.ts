import { loadLocalEnv } from "./load-env";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb, type Database } from "@/db/client";
import { mockLyricsProvider } from "@/lyrics/mock";
import { createMockMusicProvider } from "@/music/mock";
import { createLocalStorage } from "@/storage";
import { appSettings, occasions, orders, questionnaireVersions, users } from "@/db/schema";
import { handleLyricsGenerate } from "@/jobs/handlers";
import { runPreviewMusic } from "@/jobs/music";
import { approveLyrics } from "@/orders/lyrics";
import { transitionOrder } from "@/orders/service";

loadLocalEnv();

export function connectTestDb() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST fehlt");
  return createDb(url, { max: 2 });
}

/** Legt einen Testkunden mit einer Bestellung an (setzt Beispieldaten voraus). */
export async function createUserWithOrder(db: Database) {
  const userId = randomUUID();
  await db.insert(users).values({ id: userId, email: `test-${userId}@example.invalid` });
  const [occasion] = await db.select().from(occasions).where(eq(occasions.slug, "geburtstag"));
  if (!occasion) throw new Error("Beispieldaten fehlen");
  const [version] = await db
    .select()
    .from(questionnaireVersions)
    .where(eq(questionnaireVersions.occasionId, occasion.id));
  if (!version) throw new Error("Fragebogen-Version fehlt");
  const [order] = await db
    .insert(orders)
    .values({
      publicRef: `T-${userId.slice(0, 8)}`,
      userId,
      occasionId: occasion.id,
      questionnaireVersionId: version.id,
      isTest: true,
    })
    .returning();
  if (!order) throw new Error("Bestellung konnte nicht angelegt werden");
  return { userId, order };
}

/** Alles, was die Worker-Schritte brauchen – mit Test-Bausteinen und einem eigenen Test-Speicherordner. */
export function testDeps(db: Database, boss: import("pg-boss").PgBoss) {
  const tools = {
    ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
    ffprobe: process.env.FFPROBE_PATH || "ffprobe",
  };
  return {
    db,
    boss,
    lyrics: mockLyricsProvider,
    music: createMockMusicProvider(tools),
    storage: createLocalStorage(TEST_STORAGE_DIR),
    tools,
    baseUrl: "http://localhost:3200",
  };
}

export const TEST_STORAGE_DIR = ".test-storage";

/** Kurze Test-Songs (60 s) und keine Wartezeit – für schnelle Musik- und Videotests. */
export async function useShortSongs(db: Database) {
  process.env.MOCK_MUSIC_DELAY_MS = "0";
  process.env.MOCK_MUSIC_DURATION_S = "60";
  delete process.env.MOCK_MUSIC_MODE;
  await db
    .insert(appSettings)
    .values({ key: "song_target_duration_s", value: 60 })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: 60 } });
}

/** Bestellung mit echter Hörprobe: Songtext (Test-Baustein) freigegeben, Musik erzeugt. */
export async function orderWithRealPreview(db: Database, boss: import("pg-boss").PgBoss) {
  const { userId, order } = await createUserWithOrder(db);
  const deps = testDeps(db, boss);
  await transitionOrder(db, order.id, "lyrics_generating", { actor: "test" });
  await handleLyricsGenerate(deps, { orderId: order.id, targetVersion: 1 });
  await approveLyrics(db, boss, order.publicRef, userId);
  await runPreviewMusic(deps, order.id);
  return { userId, order };
}

/** Einstellung für einen Test setzen (Testdatenbank). */
export async function setSetting(db: Database, key: string, value: unknown) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}
