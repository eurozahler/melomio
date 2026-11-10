// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { seed } from "@/db/seed";
import { appSettings, devMailbox, emailEvents, orderStatusHistory, orders } from "@/db/schema";
import { readHeartbeat, runWatchdog, writeHeartbeat } from "@/monitoring/watchdog";
import { transitionOrder } from "@/orders/service";
import { connectTestDb, createUserWithOrder } from "./helpers";

const { db, pool } = connectTestDb();
process.env.ALERT_EMAIL = "alarm@example.invalid";

beforeAll(async () => {
  await seed(db);
});
afterAll(async () => {
  delete process.env.ALERT_EMAIL;
  await pool.end();
});

const alerts = () =>
  db
    .select()
    .from(devMailbox)
    .where(and(eq(devMailbox.recipient, "alarm@example.invalid"), like(devMailbox.template, "alert:%")));

describe("Überwachung (C9)", () => {
  it("Lebenszeichen wird geschrieben und gelesen", async () => {
    await writeHeartbeat(db, "abc1234");
    const beat = await readHeartbeat(db);
    expect(beat?.version).toBe("abc1234");
    expect(Date.now() - beat!.at.getTime()).toBeLessThan(10_000);
  });

  it("meldet hängende Bestellungen und niedriges Guthaben – je Tag nur einmal", async () => {
    const { order } = await createUserWithOrder(db);
    await transitionOrder(db, order.id, "lyrics_generating", { actor: "test" });
    await db
      .update(orderStatusHistory)
      .set({ at: new Date(Date.now() - 2 * 3600_000) })
      .where(eq(orderStatusHistory.orderId, order.id));

    const music = { name: "mureka", getBalanceCents: async () => 120 };
    const before = (await alerts()).length;
    const findings = await runWatchdog(db, music, { lowBalanceCents: 300 });
    expect(findings.some((f) => f.includes("hängende"))).toBe(true);
    expect(findings.some((f) => f.includes("Guthaben 120"))).toBe(true);
    const sent = await alerts();
    expect(sent.length).toBeGreaterThan(before);
    expect(sent.some((m) => m.subject.includes("Guthaben bei mureka niedrig"))).toBe(true);

    // Zweiter Lauf am selben Tag: keine doppelte Guthaben-Mail
    await runWatchdog(db, music, { lowBalanceCents: 300 });
    const again = await alerts();
    expect(again.filter((m) => m.subject.includes("Guthaben")).length).toBe(1);

    await db.update(orders).set({ status: "failed" }).where(eq(orders.id, order.id));
  });

  it("ohne Probleme keine Meldung", async () => {
    await db.delete(emailEvents).where(like(emailEvents.template, "alert:%"));
    const findings = await runWatchdog(db, { name: "mock" }, {});
    expect(findings.filter((f) => f.includes("Guthaben"))).toHaveLength(0);
    await db.delete(appSettings).where(eq(appSettings.key, "worker_heartbeat"));
  });
});
