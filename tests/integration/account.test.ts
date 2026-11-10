import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { AccountActionError, deleteAccount, expireOldPreviews, exportAccount } from "@/account/service";
import { seed } from "@/db/seed";
import {
  answers,
  invoices,
  lyricsVersions,
  musicJobs,
  orderStatusHistory,
  orders,
  refunds,
  sessions,
  users,
} from "@/db/schema";
import { createInvoiceForOrder } from "@/invoices/service";
import { createBoss } from "@/jobs/boss";
import { processPaymentUpdate, startCheckout } from "@/orders/checkout";
import { refundOrder } from "@/orders/refund";
import { createMockPaymentProvider, setMockPaymentStatus } from "@/payments/mock";
import { connectTestDb, orderWithRealPreview, testDeps, useShortSongs as shortSongs } from "./helpers";

const { db, pool } = connectTestDb();
let boss: PgBoss;
const BASE = "http://localhost:3200";
const provider = () => createMockPaymentProvider(db, BASE);
const storage = () => testDeps(db, boss).storage;

beforeAll(async () => {
  await seed(db);
  boss = createBoss(process.env.DATABASE_URL_TEST!, "sender");
  await boss.start();
  await shortSongs(db);
});

afterAll(async () => {
  await boss.stop({ graceful: false });
  await pool.end();
});

async function pay(order: { id: string; publicRef: string }, userId: string) {
  const url = await startCheckout(db, provider(), {
    publicRef: order.publicRef,
    userId,
    accepted: { termsPrivacy: true, withdrawalWaiver: true },
    ipHash: "hash",
    baseUrl: BASE,
    webhookUrl: null,
  });
  const id = url.split("/dev/zahlung/")[1]!;
  await setMockPaymentStatus(db, id, "paid");
  await processPaymentUpdate(db, boss, provider(), id, "webhook");
}

const statusOf = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!.status;

describe("Datenexport und Konto löschen (DSGVO)", () => {
  it("Export enthält Konto, Bestellung, Antworten und Songtext – ohne Passwörter", async () => {
    const { userId, order } = await orderWithRealPreview(db, boss);
    const data = await exportAccount(db, userId);
    expect(data.konto.email).toMatch(/@example\.invalid$/);
    const mine = data.bestellungen.find((b) => b.bestellnummer === order.publicRef)!;
    expect(mine.songtexte.length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toMatch(/password/i);
  });

  it("Löschen entfernt Inhalte und Dateien, anonymisiert das Konto und behält die Rechnung", async () => {
    const { userId, order } = await orderWithRealPreview(db, boss);
    await pay(order, userId);
    await db.update(orders).set({ status: "completed" }).where(eq(orders.id, order.id));
    const invoice = await createInvoiceForOrder(db, storage(), order.id);
    await db.insert(sessions).values({
      id: `s-${userId}`,
      token: `t-${userId}`,
      userId,
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const result = await deleteAccount(db, storage(), userId);
    expect(result.files).toBeGreaterThan(0);

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user!.email).toBe(`geloescht-${userId}@deleted.invalid`);
    expect(user!.deletedAt).not.toBeNull();
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
    expect(await db.select().from(answers).where(eq(answers.orderId, order.id))).toHaveLength(0);
    expect(await db.select().from(lyricsVersions).where(eq(lyricsVersions.orderId, order.id))).toHaveLength(
      0,
    );
    expect(await db.select().from(musicJobs).where(eq(musicJobs.orderId, order.id))).toHaveLength(0);
    // Rechnung bleibt (Aufbewahrungspflicht), ebenso die Datei
    const [kept] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(kept).toBeTruthy();
    expect(await storage().open(invoice.storageKey)).not.toBeNull();

    await expect(deleteAccount(db, storage(), userId)).rejects.toBeInstanceOf(AccountActionError);
  });

  it("solange der Worker an einer Bestellung arbeitet, wird nicht gelöscht", async () => {
    const { userId, order } = await orderWithRealPreview(db, boss);
    await db.update(orders).set({ status: "video_rendering" }).where(eq(orders.id, order.id));
    await expect(deleteAccount(db, storage(), userId)).rejects.toMatchObject({ code: "busy" });
  });
});

describe("Hörproben ohne Kauf laufen ab", () => {
  it("nach preview_expiry_days → „abgelaufen“, Audiodateien weg, Songtext bleibt", async () => {
    const { order } = await orderWithRealPreview(db, boss);
    expect(await statusOf(order.id)).toBe("preview_ready");
    // „Hörprobe bereit“ 30 Tage zurückdatieren
    await db
      .update(orderStatusHistory)
      .set({ at: new Date(Date.now() - 30 * 24 * 3600_000) })
      .where(eq(orderStatusHistory.orderId, order.id));
    const result = await expireOldPreviews(db, storage());
    expect(result.orders).toBeGreaterThanOrEqual(1);
    expect(await statusOf(order.id)).toBe("preview_expired");
    expect(await db.select().from(musicJobs).where(eq(musicJobs.orderId, order.id))).toHaveLength(0);
    expect(
      await db.select().from(lyricsVersions).where(eq(lyricsVersions.orderId, order.id)),
    ).not.toHaveLength(0);
  });

  it("frische Hörproben bleiben", async () => {
    const { order } = await orderWithRealPreview(db, boss);
    await expireOldPreviews(db, storage());
    expect(await statusOf(order.id)).toBe("preview_ready");
  });
});

describe("Erstattung", () => {
  it("bucht zurück, erstellt die Stornorechnung und setzt „erstattet“ – nur einmal", async () => {
    const { userId, order } = await orderWithRealPreview(db, boss);
    await pay(order, userId);
    await db.update(orders).set({ status: "completed" }).where(eq(orders.id, order.id));
    await createInvoiceForOrder(db, storage(), order.id);

    const result = await refundOrder(db, provider(), storage(), order.publicRef, userId, "Kulanz");
    expect(result.stornoNumber).toMatch(/^TEST-ST-/);
    expect(await statusOf(order.id)).toBe("refunded");
    const rows = await db.select().from(refunds);
    expect(rows.some((r) => r.providerRefundId === result.providerRefundId && r.amountCents === 999)).toBe(
      true,
    );
    await expect(refundOrder(db, provider(), storage(), order.publicRef, userId, null)).rejects.toMatchObject(
      {
        code: "already_refunded",
      },
    );
  });

  it("eine unbezahlte Bestellung lässt sich nicht erstatten", async () => {
    const { userId, order } = await orderWithRealPreview(db, boss);
    await expect(refundOrder(db, provider(), storage(), order.publicRef, userId, null)).rejects.toMatchObject(
      {
        code: "not_paid",
      },
    );
  });
});
