import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { seed } from "@/db/seed";
import { orders, payments, users } from "@/db/schema";
import { createInvoiceForOrder } from "@/invoices/service";
import { createBoss } from "@/jobs/boss";
import { processPaymentUpdate, startCheckout } from "@/orders/checkout";
import { transitionOrder } from "@/orders/service";
import { createVoucher, discountFor, findValidVoucher } from "@/orders/vouchers";
import { createMockPaymentProvider, setMockPaymentStatus } from "@/payments/mock";
import { connectTestDb, createUserWithOrder, testDeps } from "./helpers";

const { db, pool } = connectTestDb();
let boss: PgBoss;
const BASE = "http://localhost:3200";
const provider = () => createMockPaymentProvider(db, BASE);
const tag = Date.now().toString(36).toUpperCase();
let actor: string;

beforeAll(async () => {
  await seed(db);
  boss = createBoss(process.env.DATABASE_URL_TEST!, "sender");
  await boss.start();
  actor = `voucher-admin-${tag}`;
  await db.insert(users).values({ id: actor, email: `${actor}@example.invalid` });
});

afterAll(async () => {
  await boss.stop({ graceful: false });
  await pool.end();
});

async function previewOrder() {
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

const checkout = (publicRef: string, userId: string, voucherCode: string | null) =>
  startCheckout(db, provider(), {
    publicRef,
    userId,
    accepted: { termsPrivacy: true, withdrawalWaiver: true },
    ipHash: "hash",
    baseUrl: BASE,
    webhookUrl: null,
    voucherCode,
    boss,
  });

describe("Gutscheine (C5)", () => {
  it("rechnet Prozent- und Festbetrag-Rabatte und begrenzt sie auf den Preis", () => {
    expect(discountFor(999, { kind: "percent", value: 10 })).toBe(100);
    expect(discountFor(999, { kind: "fixed", value: 200 })).toBe(200);
    expect(discountFor(999, { kind: "fixed", value: 5000 })).toBe(999);
  });

  it("10 %: Zahlung über 8,99 €, Rechnung mit Rabattzeile und stimmigen Summen", async () => {
    await createVoucher(
      db,
      { code: `zehn-${tag}`, kind: "percent", value: 10, maxRedemptions: null, validUntil: null, note: null },
      actor,
    );
    const { userId, order } = await previewOrder();
    const url = await checkout(order.publicRef, userId, `ZEHN-${tag}`);
    const id = url.split("/dev/zahlung/")[1]!;
    const [payment] = await db.select().from(payments).where(eq(payments.providerPaymentId, id));
    expect(payment!.amountCents).toBe(899);
    await setMockPaymentStatus(db, id, "paid");
    await processPaymentUpdate(db, boss, provider(), id, "webhook");
    const invoice = await createInvoiceForOrder(db, testDeps(db, boss).storage, order.id);
    expect(invoice.grossCents).toBe(899);
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.lines[1]).toMatchObject({ description: `Gutschein ZEHN-${tag}`, grossCents: -100 });
    expect(invoice.lines.reduce((s, l) => s + l.netCents, 0)).toBe(invoice.netCents);
    expect(invoice.lines.reduce((s, l) => s + l.taxCents, 0)).toBe(invoice.taxCents);
  });

  it("100 %: keine Bezahlseite, Bestellung sofort bezahlt", async () => {
    await createVoucher(
      db,
      {
        code: `GRATIS-${tag}`,
        kind: "percent",
        value: 100,
        maxRedemptions: 1,
        validUntil: null,
        note: "Gewinnspiel",
      },
      actor,
    );
    const { userId, order } = await previewOrder();
    const url = await checkout(order.publicRef, userId, `gratis-${tag}`);
    expect(url).toBe(`${BASE}/bestellung/${order.publicRef}?zahlung=zurueck`);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.status).toBe("paid");
    expect(o!.paidAt).not.toBeNull();
    // Limit 1 erreicht → nicht mehr gültig
    expect(await findValidVoucher(db, `GRATIS-${tag}`)).toBeNull();
  });

  it("abgelaufene, deaktivierte und unbekannte Codes werden abgelehnt", async () => {
    await createVoucher(
      db,
      {
        code: `ALT-${tag}`,
        kind: "fixed",
        value: 200,
        maxRedemptions: null,
        validUntil: new Date("2020-01-01"),
        note: null,
      },
      actor,
    );
    const { userId, order } = await previewOrder();
    await expect(checkout(order.publicRef, userId, `ALT-${tag}`)).rejects.toMatchObject({
      code: "voucher_invalid",
    });
    await expect(checkout(order.publicRef, userId, "GIBTESNICHT")).rejects.toMatchObject({
      code: "voucher_invalid",
    });
  });

  it("doppelte Codes und unsinnige Werte werden beim Anlegen abgelehnt", async () => {
    await expect(
      createVoucher(
        db,
        {
          code: `zehn-${tag}`,
          kind: "percent",
          value: 5,
          maxRedemptions: null,
          validUntil: null,
          note: null,
        },
        actor,
      ),
    ).rejects.toThrow(/gibt es schon/);
    await expect(
      createVoucher(
        db,
        { code: `X-${tag}`, kind: "percent", value: 150, maxRedemptions: null, validUntil: null, note: null },
        actor,
      ),
    ).rejects.toThrow(/höchstens 100/);
  });
});
