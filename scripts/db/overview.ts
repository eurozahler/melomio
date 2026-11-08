/**
 * Zeigt eine Übersicht der Datenbank: Tabellen mit Anzahl der Einträge und den Katalog.
 * Aufruf: npm run db:overview   (Tunnel muss offen sein)
 */
import { loadEnvConfig } from "@next/env";
import { asc, eq, sql } from "drizzle-orm";
import { createDb } from "../../src/db/client";
import {
  appSettings,
  genres,
  moods,
  occasions,
  prices,
  products,
  questionnaireVersions,
  questions,
  voices,
} from "../../src/db/schema";

loadEnvConfig(process.cwd());

async function main() {
  const url = process.argv.includes("--test") ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL fehlt");
  const { db, pool } = createDb(url, { max: 1 });
  try {
    console.log(`\nDatenbank: ${new URL(url).pathname.slice(1)}\n`);

    const tables = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
    );
    const counts: Array<{ Tabelle: string; Einträge: number }> = [];
    for (const { table_name } of tables.rows) {
      const r = await db.execute<{ n: number }>(sql.raw(`select count(*)::int as n from "${table_name}"`));
      counts.push({ Tabelle: table_name, Einträge: r.rows[0]?.n ?? 0 });
    }
    console.log(`${counts.length} Tabellen:`);
    console.table(counts);

    for (const occ of await db.select().from(occasions).orderBy(asc(occasions.sort))) {
      const qs = await db
        .select({
          key: questions.key,
          type: questions.type,
          label: questions.label,
          required: questions.required,
          condition: questions.condition,
        })
        .from(questions)
        .innerJoin(questionnaireVersions, eq(questions.versionId, questionnaireVersions.id))
        .where(eq(questionnaireVersions.occasionId, occ.id))
        .orderBy(asc(questions.sort));
      console.log(`\nAnlass „${occ.name.de}“ – ${qs.length} Fragen:`);
      for (const q of qs) {
        const cond = q.condition
          ? `   ↳ nur wenn ${q.condition.questionKey} = ${q.condition.anyOf.join("/")}`
          : "";
        console.log(`  ${q.required ? "*" : " "} ${q.label.de}  [${q.type}]${cond}`);
      }
    }

    const list = async (title: string, table: typeof genres | typeof moods | typeof voices) =>
      console.log(
        `\n${title}: ${(await db.select().from(table).orderBy(asc(table.sort))).map((r) => r.name.de).join(", ")}`,
      );
    await list("Genres", genres);
    await list("Stimmungen", moods);
    await list("Stimmen", voices);

    const price = await db
      .select({ name: products.name, gross: prices.grossCents, currency: prices.currency })
      .from(prices)
      .innerJoin(products, eq(prices.productId, products.id));
    for (const p of price)
      console.log(`\nPreis: ${p.name.de} – ${(p.gross / 100).toFixed(2).replace(".", ",")} ${p.currency}`);

    console.log("\nEinstellungen:");
    console.table(
      (await db.select().from(appSettings).orderBy(asc(appSettings.key))).map((s) => ({
        Schlüssel: s.key,
        Wert: s.value,
      })),
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
