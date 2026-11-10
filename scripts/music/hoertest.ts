/**
 * Hörtest: erzeugt EINEN echten Song über den Mureka-Baustein und speichert ihn unter hoertest/.
 * KOSTENPFLICHTIG (ein Song vom Mureka-API-Guthaben) – nur nach Freigabe ausführen.
 *
 * Aufruf:  npx tsx scripts/music/hoertest.ts [pop|schlager|ballade|rap|akustik|deutschrock]
 * Voraussetzung: MUREKA_API_KEY in .env.local (optional MUREKA_MODEL).
 */
import { mkdir, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { SEED_GENRES, SEED_MOODS, SEED_VOICES } from "../../src/db/seed-data";
import { createMurekaMusicProvider } from "../../src/music/mureka";
import type { MusicInput } from "../../src/music/types";

loadEnvConfig(process.cwd());

const genreSlug = process.argv[2] ?? "pop";
const genre = SEED_GENRES.find(([slug]) => slug === genreSlug);
if (!genre) {
  console.error(`Unbekanntes Genre „${genreSlug}“. Möglich: ${SEED_GENRES.map(([s]) => s).join(", ")}`);
  process.exit(1);
}
const apiKey = process.env.MUREKA_API_KEY?.trim();
if (!apiKey) {
  console.error("MUREKA_API_KEY fehlt in .env.local");
  process.exit(1);
}

const input: MusicInput = {
  lyrics: {
    title: "Dein Tag, Anna",
    sections: [
      {
        type: "verse",
        lines: [
          "Heute ist dein Tag, liebe Anna,",
          "die Sonne lacht nur für dich allein.",
          "Dreißig Jahre voller Lachen,",
          "und das Beste kommt erst noch, ganz bestimmt.",
        ],
      },
      {
        type: "chorus",
        lines: [
          "Happy Birthday, Anna, wir feiern dich,",
          "heute Nacht tanzen wir ins Licht.",
          "Mit Freunden, Kuchen, Kerzenschein,",
          "so soll dein Geburtstag sein!",
        ],
      },
      {
        type: "verse",
        lines: [
          "Weißt du noch, die Fahrt ans Meer,",
          "der Bus war alt, die Taschen schwer.",
          "Jürgen hat die Karte falsch gehalten,",
          "doch wir haben bis zum Morgen gelacht.",
        ],
      },
      {
        type: "chorus",
        lines: [
          "Happy Birthday, Anna, wir feiern dich,",
          "heute Nacht tanzen wir ins Licht.",
          "Mit Freunden, Kuchen, Kerzenschein,",
          "so soll dein Geburtstag sein!",
        ],
      },
    ],
  },
  genreHint: genre[2],
  moodHint: SEED_MOODS[0]![2],
  voiceHint: genreSlug === "rap" || genreSlug === "deutschrock" ? SEED_VOICES[0]![2] : SEED_VOICES[3]![2],
  language: "de",
  targetDurationS: 150,
};

const provider = createMurekaMusicProvider(apiKey, { model: process.env.MUREKA_MODEL?.trim() || undefined });
const work = await mkdtemp(path.join(tmpdir(), "melomio-hoertest-"));
const started = Date.now();
console.log(`Erzeuge Song (${genre[1]}) bei Mureka … das dauert meist 1–3 Minuten.`);
try {
  const result = await provider.generate(input, work);
  await mkdir("hoertest", { recursive: true });
  const target = path.join("hoertest", `${genreSlug}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.mp3`);
  await copyFile(result.file, target);
  console.log(`✓ Fertig nach ${Math.round((Date.now() - started) / 1000)} s – Modell ${result.model}`);
  console.log(`  Datei: ${path.resolve(target)}`);
  if (result.sections) console.log(`  Abschnitte: ${result.sections.map((s) => `${s.label} ${Math.round(s.startMs / 1000)}s`).join(", ")}`);
} finally {
  await rm(work, { recursive: true, force: true });
}
