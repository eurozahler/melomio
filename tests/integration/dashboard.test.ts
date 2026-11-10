// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { getMonthlyStats } from "@/admin/service";
import { connectTestDb } from "./helpers";

const { db, pool } = connectTestDb();
afterAll(async () => {
  await pool.end();
});

describe("Dashboard-Monatsübersicht", () => {
  it("liefert die letzten 6 Monate, neuester zuerst, mit Zahlen statt Text", async () => {
    const rows = await getMonthlyStats(db, { test: true });
    expect(rows).toHaveLength(6);
    expect(rows[0]!.month).toBe(
      new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()).slice(0, 7),
    );
    expect(rows[0]!.month > rows[5]!.month).toBe(true);
    for (const r of rows) expect(typeof r.revenueCents).toBe("number");
  });
});
