import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "@/db/seed";
import { listOrdersForUser } from "@/server/orders";
import { connectTestDb, createUserWithOrder } from "./helpers";

const { db, pool } = connectTestDb();

beforeAll(async () => {
  await seed(db);
});

afterAll(async () => {
  await pool.end();
});

describe("Bestellungen im Kundenkonto (Abnahme M3b)", () => {
  it("Kunde A sieht die Bestellungen von Kunde B nicht", async () => {
    const a = await createUserWithOrder(db);
    const b = await createUserWithOrder(db);

    const ordersA = await listOrdersForUser(a.userId, db);
    const ordersB = await listOrdersForUser(b.userId, db);

    expect(ordersA.map((o) => o.id)).toEqual([a.order.id]);
    expect(ordersB.map((o) => o.id)).toEqual([b.order.id]);
    expect(ordersA.some((o) => o.id === b.order.id)).toBe(false);
  });

  it("ein Konto ohne Bestellungen bekommt eine leere Liste", async () => {
    expect(await listOrdersForUser("gibt-es-nicht", db)).toEqual([]);
  });
});
