import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { seed } from "@/db/seed";
import { appSettings, priceSnapshots, questionOptions, questions } from "@/db/schema";
import { SETTING_KEYS, validateSetting, type SettingKey } from "@/db/settings";
import { SEED_OCCASIONS } from "@/db/seed-data";
import { connectTestDb, createUserWithOrder } from "./helpers";

const { db, pool } = connectTestDb();

/** Drizzle verpackt Datenbankfehler; die Meldung der Datenbank steckt in `cause`. */
async function dbErrorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    const cause = (e as { cause?: unknown }).cause;
    return cause instanceof Error ? cause.message : String(e);
  }
  throw new Error("Es wurde ein Datenbankfehler erwartet");
}

async function countRows(table: string) {
  const r = await db.execute<{ n: number }>(sql.raw(`select count(*)::int as n from "${table}"`));
  return r.rows[0]?.n ?? 0;
}

beforeAll(async () => {
  await seed(db);
});

afterAll(async () => {
  await pool.end();
});

describe("Migrationen und Beispieldaten (M2)", () => {
  it("legt auf einer leeren Datenbank alle Tabellen an", async () => {
    const r = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    expect(r.rows[0]?.n).toBe(47); // + vouchers, voucher_redemptions (C5) // users.deleted_at ist nur eine Spalte · + invoices, invoice_counters (Rechnungen) // + dev_mock_payments (M7) // 37 aus M2 + sessions, accounts, verifications, dev_mailbox (M3b) + job_executions (M4)
  });

  it("spielt die Beispieldaten vollständig ein", async () => {
    expect(await countRows("occasions")).toBe(3);
    expect(await countRows("genres")).toBe(6);
    expect(await countRows("moods")).toBe(4);
    expect(await countRows("voices")).toBe(4);
    expect(await countRows("prices")).toBe(1);
    expect(await countRows("questions")).toBe(SEED_OCCASIONS.reduce((n, o) => n + o.questions.length, 0));
    expect(await countRows("app_settings")).toBe(SETTING_KEYS.length);
  });

  it("ein zweiter Seed-Lauf legt nichts doppelt an", async () => {
    const before = await Promise.all(
      ["occasions", "questions", "question_options", "prices", "genres"].map(countRows),
    );
    await seed(db);
    const after = await Promise.all(
      ["occasions", "questions", "question_options", "prices", "genres"].map(countRows),
    );
    expect(after).toEqual(before);
  });

  it("jede Folgefrage verweist auf eine vorhandene Frage und Antwort derselben Version", async () => {
    const all = await db.select().from(questions);
    const conditional = all.filter((q) => q.condition);
    expect(conditional.length).toBe(3);
    for (const q of conditional) {
      const target = all.find((t) => t.versionId === q.versionId && t.key === q.condition!.questionKey);
      expect(target, `Bezug von ${q.key}`).toBeDefined();
      const opts = await db.select().from(questionOptions).where(eq(questionOptions.questionId, target!.id));
      for (const value of q.condition!.anyOf) expect(opts.map((o) => o.value)).toContain(value);
    }
  });

  it("alle gespeicherten Einstellungen erfüllen ihre Regeln", async () => {
    for (const row of await db.select().from(appSettings)) {
      expect(() => validateSetting(row.key as SettingKey, row.value)).not.toThrow();
    }
  });
});

describe("Preis-Snapshot ist unveränderlich (Abnahmekriterium M2)", () => {
  it("die Datenbank lehnt jede Änderung ab, der Wert bleibt erhalten", async () => {
    const { order } = await createUserWithOrder(db);
    const [snap] = await db
      .insert(priceSnapshots)
      .values({
        orderId: order.id,
        items: [
          { productSlug: "song", name: "Persönlicher Song mit Video", quantity: 1, unitGrossCents: 999 },
        ],
        netCents: 839,
        taxCents: 160,
        grossCents: 999,
        taxRateBp: 1900,
        currency: "EUR",
      })
      .returning();

    const message = await dbErrorOf(
      db.update(priceSnapshots).set({ grossCents: 1 }).where(eq(priceSnapshots.id, snap!.id)),
    );
    expect(message).toMatch(/unveraenderlich/);

    const [after] = await db.select().from(priceSnapshots).where(eq(priceSnapshots.id, snap!.id));
    expect(after?.grossCents).toBe(999);
  });

  it("die Änderungssperre greift auch bei direktem SQL", async () => {
    expect(await dbErrorOf(db.execute(sql`update price_snapshots set gross_cents = 0`))).toMatch(
      /unveraenderlich/,
    );
  });
});
