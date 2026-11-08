import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { seed } from "@/db/seed";
import {
  consents,
  devMailbox,
  devMockPayments,
  orders,
  paymentEvents,
  payments,
  priceSnapshots,
} from "@/db/schema";
import { createBoss } from "@/jobs/boss";
import { handleOrderPaid } from "@/jobs/handlers";
import { QUEUES } from "@/jobs/queues";
import { CheckoutError, processPaymentUpdate, startCheckout } from "@/orders/checkout";
import { transitionOrder } from "@/orders/service";
import { createMockPaymentProvider, setMockPaymentStatus } from "@/payments/mock";
import { connectTestDb, createUserWithOrder, orderWithRealPreview, testDeps, useShortSongs } from "./helpers";

const { db, pool } = connectTestDb();
let boss: PgBoss;
const BASE = "http://localhost:3200";
const provider = () => createMockPaymentProvider(db, BASE);

beforeAll(async () => {
  await seed(db);
  boss = createBoss(process.env.DATABASE_URL_TEST!, "sender");
  await boss.start();
});

afterAll(async () => {
  await boss.stop({ graceful: false });
  await pool.end();
});

async function statusOf(orderId: string) {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  return o!;
}

/** Bestellung mit fertiger Hörprobe (Status „Hörprobe bereit“). */
async function orderWithPreview() {
  const { userId, order } = await createUserWithOrder(db);
  for (const to of [
    "lyrics_generating",
    "lyrics_review",
    "lyrics_approved",
    "music_generating",
    "preview_ready",
  ] as const) {
    await transitionOrder(db, order.id, to, { actor: "test" });
  }
  return { userId, order };
}

const BOTH = { termsPrivacy: true, withdrawalWaiver: true };

async function checkout(publicRef: string, userId: string, accepted = BOTH) {
  return startCheckout(db, provider(), {
    publicRef,
    userId,
    accepted,
    ipHash: "hash",
    baseUrl: BASE,
    webhookUrl: null,
  });
}

function mockIdFrom(url: string) {
  return url.split("/dev/zahlung/")[1]!;
}

describe("Checkout (Abnahme M7)", () => {
  it("ohne beide Pflicht-Haken keine Zahlung", async () => {
    const { userId, order } = await orderWithPreview();
    for (const accepted of [
      { termsPrivacy: true, withdrawalWaiver: false },
      { termsPrivacy: false, withdrawalWaiver: true },
      { termsPrivacy: false, withdrawalWaiver: false },
    ]) {
      await expect(checkout(order.publicRef, userId, accepted)).rejects.toMatchObject({
        code: "consents_required",
      });
    }
    expect((await statusOf(order.id)).status).toBe("preview_ready");
    expect(await db.select().from(payments).where(eq(payments.orderId, order.id))).toHaveLength(0);
  });

  it("friert den Preis ein, speichert beide Einwilligungen mit Textversion und legt die Zahlung an", async () => {
    const { userId, order } = await orderWithPreview();
    const url = await checkout(order.publicRef, userId);
    expect(url).toMatch(new RegExp(`^${BASE}/dev/zahlung/mock_`));
    expect((await statusOf(order.id)).status).toBe("awaiting_payment");

    const [snap] = await db.select().from(priceSnapshots).where(eq(priceSnapshots.orderId, order.id));
    expect(snap).toMatchObject({
      grossCents: 999,
      netCents: 839,
      taxCents: 160,
      taxRateBp: 1900,
      currency: "EUR",
    });

    const given = await db.select().from(consents).where(eq(consents.orderId, order.id));
    expect(given.map((c) => c.type).sort()).toEqual(["terms_privacy", "withdrawal_waiver"]);
    expect(given.every((c) => c.textVersion.length > 0 && c.ipHash === "hash")).toBe(true);
  });

  it("ein zweiter Klick öffnet dieselbe Bezahlseite statt einer zweiten Zahlung", async () => {
    const { userId, order } = await orderWithPreview();
    const first = await checkout(order.publicRef, userId);
    const second = await checkout(order.publicRef, userId);
    expect(second).toBe(first);
    expect(await db.select().from(payments).where(eq(payments.orderId, order.id))).toHaveLength(1);
  });

  it("ein fremdes Konto kann nicht kaufen", async () => {
    const { order } = await orderWithPreview();
    const { userId: stranger } = await createUserWithOrder(db);
    const error = await checkout(order.publicRef, stranger).catch((e) => e);
    expect(error).toBeInstanceOf(CheckoutError);
    expect(error.code).toBe("not_found");
  });
});

describe("Zahlungsbestätigung (Webhook)", () => {
  it("bestätigte Zahlung → „bezahlt“; ein doppelter Webhook bewirkt nur eine Verarbeitung", async () => {
    const { userId, order } = await orderWithPreview();
    const id = mockIdFrom(await checkout(order.publicRef, userId));
    await setMockPaymentStatus(db, id, "paid");

    expect(await processPaymentUpdate(db, boss, provider(), id, "webhook")).toEqual({ outcome: "paid" });
    expect(await processPaymentUpdate(db, boss, provider(), id, "webhook")).toEqual({ outcome: "unchanged" });

    const after = await statusOf(order.id);
    expect(after.status).toBe("paid");
    expect(after.paidAt).toBeInstanceOf(Date);
    const history = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from order_status_history where order_id = ${order.id} and to_status = 'paid'`,
    );
    expect(history.rows[0]?.n).toBe(1);
    const jobs = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from pgboss.job where name = ${QUEUES.orderPaid} and data->>'orderId' = ${order.id}`,
    );
    expect(jobs.rows[0]?.n).toBe(1);
    expect(await db.select().from(paymentEvents).where(eq(paymentEvents.providerPaymentId, id))).toHaveLength(
      2,
    );
  });

  it("ein Webhook mit erfundener ID bewirkt keine Statusänderung", async () => {
    const { userId, order } = await orderWithPreview();
    await checkout(order.publicRef, userId);
    expect(await processPaymentUpdate(db, boss, provider(), "mock_erfunden", "webhook")).toMatchObject({
      outcome: "ignored",
    });
    expect(
      await processPaymentUpdate(db, boss, provider(), "'; drop table orders; --", "webhook"),
    ).toMatchObject({
      outcome: "ignored",
    });
    expect((await statusOf(order.id)).status).toBe("awaiting_payment");
  });

  it("die Rückleitung allein reicht nicht: offene Zahlung bleibt offen", async () => {
    const { userId, order } = await orderWithPreview();
    const id = mockIdFrom(await checkout(order.publicRef, userId));
    // Status beim Anbieter ist weiterhin „open“
    expect(await processPaymentUpdate(db, boss, provider(), id, "rueckkehr")).toEqual({
      outcome: "unchanged",
    });
    expect((await statusOf(order.id)).paidAt).toBeNull();
  });

  it("abgebrochene Zahlung führt nicht zu „bezahlt“, sondern zurück zur Hörprobe – neuer Versuch möglich", async () => {
    const { userId, order } = await orderWithPreview();
    const id = mockIdFrom(await checkout(order.publicRef, userId));
    await setMockPaymentStatus(db, id, "canceled");
    expect(await processPaymentUpdate(db, boss, provider(), id, "webhook")).toEqual({ outcome: "failed" });
    const after = await statusOf(order.id);
    expect(after.status).toBe("preview_ready");
    expect(after.paidAt).toBeNull();

    const second = await checkout(order.publicRef, userId);
    expect(mockIdFrom(second)).not.toBe(id);
    expect(await db.select().from(priceSnapshots).where(eq(priceSnapshots.orderId, order.id))).toHaveLength(
      1,
    );
  });

  it("weicht der Betrag beim Anbieter ab, wird nichts bestätigt", async () => {
    const { userId, order } = await orderWithPreview();
    const id = mockIdFrom(await checkout(order.publicRef, userId));
    await db
      .update(devMockPayments)
      .set({ status: "paid", amountCents: 1 })
      .where(eq(devMockPayments.id, id));
    expect(await processPaymentUpdate(db, boss, provider(), id, "webhook")).toMatchObject({
      outcome: "ignored",
    });
    expect((await statusOf(order.id)).status).toBe("awaiting_payment");
  });
});

describe("Bestellbestätigung per E-Mail (E16)", () => {
  it("enthält Preis, MwSt. und den Widerrufsverzicht – und wird nur einmal verschickt", async () => {
    await useShortSongs(db);
    const { userId, order } = await orderWithRealPreview(db, boss);
    const id = mockIdFrom(await checkout(order.publicRef, userId));
    await setMockPaymentStatus(db, id, "paid");
    await processPaymentUpdate(db, boss, provider(), id, "webhook");

    const deps = testDeps(db, boss);
    await handleOrderPaid(deps, { orderId: order.id });
    await handleOrderPaid(deps, { orderId: order.id });

    const [user] = await db
      .execute<{ email: string }>(sql`select email from users where id = ${userId}`)
      .then((r) => r.rows);
    const mails = await db
      .select()
      .from(devMailbox)
      .where(and(eq(devMailbox.recipient, user!.email), eq(devMailbox.template, "order-confirmation")));
    expect(mails).toHaveLength(1);
    const text = mails[0]!.text;
    expect(text).toContain(order.publicRef);
    expect(text).toMatch(/9,99\s€/);
    expect(text).toMatch(/19 % MwSt\.: 1,60\s€/);
    expect(text).toContain("dadurch mein Widerrufsrecht verliere");
    expect(text).toContain("TESTBETRIEB");
  });
});
