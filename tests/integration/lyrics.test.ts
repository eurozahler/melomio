import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { seed } from "@/db/seed";
import { lyricsVersions, orders } from "@/db/schema";
import { createBoss } from "@/jobs/boss";
import { handleLyricsGenerate } from "@/jobs/handlers";
import { QUEUES } from "@/jobs/queues";
import { mockLyricsProvider } from "@/lyrics/mock";
import {
  approveLyrics,
  getLyricsReview,
  LyricsActionError,
  requestAiRevision,
  saveCustomerEdit,
} from "@/orders/lyrics";
import { transitionOrder } from "@/orders/service";
import { connectTestDb, createUserWithOrder } from "./helpers";

const { db, pool } = connectTestDb();
let boss: PgBoss;
const deps = () => ({ db, boss, lyrics: mockLyricsProvider });

beforeAll(async () => {
  await seed(db);
  boss = createBoss(process.env.DATABASE_URL_TEST!, "sender");
  await boss.start();
});

afterAll(async () => {
  await boss.stop({ graceful: false });
  await pool.end();
});

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (e) {
    if (e instanceof LyricsActionError) return e.code;
    throw e;
  }
  return "ok";
}

async function statusOf(orderId: string) {
  const [o] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  return o?.status;
}

/** Bestellung mit fertigem erstem Songtext (Fassung 1 vom Test-Baustein). */
async function orderInReview() {
  const { userId, order } = await createUserWithOrder(db);
  await transitionOrder(db, order.id, "lyrics_generating", { actor: "test" });
  await handleLyricsGenerate(deps(), { orderId: order.id, targetVersion: 1 });
  return { userId, order };
}

const EDITED = {
  title: "Mein eigener Titel",
  sections: [
    { type: "verse", lines: ["Neue erste Zeile", "Zweite Zeile"] },
    { type: "chorus", lines: ["Refrain"] },
  ],
};

describe("Songtext erzeugen (Abnahme M5)", () => {
  it("der Worker speichert Fassung 1 mit Prompt-Version und setzt „bereit zur Prüfung“", async () => {
    const { order } = await orderInReview();
    const versions = await db.select().from(lyricsVersions).where(eq(lyricsVersions.orderId, order.id));
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, source: "ai" });
    expect(versions[0]?.promptVersionId).toBeTruthy();
    expect(await statusOf(order.id)).toBe("lyrics_review");
  });

  it("ein doppelter Auftrag erzeugt keine zweite Fassung", async () => {
    const { order } = await orderInReview();
    await handleLyricsGenerate(deps(), { orderId: order.id, targetVersion: 1 });
    expect(await db.select().from(lyricsVersions).where(eq(lyricsVersions.orderId, order.id))).toHaveLength(
      1,
    );
  });
});

describe("Selbst bearbeiten", () => {
  it("legt eine neue Fassung an (beliebig oft)", async () => {
    const { userId, order } = await orderInReview();
    expect(await codeOf(saveCustomerEdit(db, order.publicRef, userId, EDITED))).toBe("ok");
    expect(
      await codeOf(saveCustomerEdit(db, order.publicRef, userId, { ...EDITED, title: "Noch einmal" })),
    ).toBe("ok");
    const review = await getLyricsReview(db, order.publicRef, userId);
    expect(review?.current).toMatchObject({ version: 3, source: "customer_edit", title: "Noch einmal" });
  });

  it("ungültige Texte werden abgelehnt", async () => {
    const { userId, order } = await orderInReview();
    const tooLong = { title: "T", sections: [{ type: "verse", lines: ["x".repeat(200)] }] };
    expect(await codeOf(saveCustomerEdit(db, order.publicRef, userId, tooLong))).toBe("invalid");
  });

  it("ein fremdes Konto kann den Songtext weder sehen noch ändern", async () => {
    const { order } = await orderInReview();
    const { userId: stranger } = await createUserWithOrder(db);
    expect(await getLyricsReview(db, order.publicRef, stranger)).toBeNull();
    expect(await codeOf(saveCustomerEdit(db, order.publicRef, stranger, EDITED))).toBe("not_found");
    expect(await codeOf(approveLyrics(db, order.publicRef, stranger))).toBe("not_found");
  });
});

describe("KI neu formulieren lassen (Limit aus den Einstellungen, F-18)", () => {
  it("einmal kostenlos, danach greift das Limit", async () => {
    const { userId, order } = await orderInReview();
    expect((await getLyricsReview(db, order.publicRef, userId))?.revisionsLeft).toBe(1);

    await requestAiRevision(db, boss, order.publicRef, userId, "Bitte mehr über Kaffee");
    expect(await statusOf(order.id)).toBe("lyrics_generating");
    const jobs = await db.execute<{ data: { targetVersion: number; feedback: string } }>(
      sql`select data from pgboss.job where name = ${QUEUES.lyricsGenerate} and data->>'orderId' = ${order.id}`,
    );
    expect(jobs.rows[0]?.data).toMatchObject({ targetVersion: 2, feedback: "Bitte mehr über Kaffee" });

    // Worker arbeitet den Auftrag ab
    await handleLyricsGenerate(deps(), {
      orderId: order.id,
      targetVersion: 2,
      feedback: "Bitte mehr über Kaffee",
    });
    const review = await getLyricsReview(db, order.publicRef, userId);
    expect(review?.current).toMatchObject({ version: 2, source: "ai_revision" });
    expect(review?.revisionsLeft).toBe(0);

    expect(await codeOf(requestAiRevision(db, boss, order.publicRef, userId, null))).toBe("limit_reached");
    expect(await statusOf(order.id)).toBe("lyrics_review");
  });

  it("während der Neuformulierung sind keine Änderungen möglich", async () => {
    const { userId, order } = await orderInReview();
    await requestAiRevision(db, boss, order.publicRef, userId, null);
    expect(await codeOf(saveCustomerEdit(db, order.publicRef, userId, EDITED))).toBe("wrong_status");
    expect(await codeOf(approveLyrics(db, order.publicRef, userId))).toBe("wrong_status");
  });
});

describe("Freigeben", () => {
  it("nach der Freigabe ist der Text nicht mehr änderbar (Abnahme M5)", async () => {
    const { userId, order } = await orderInReview();
    await saveCustomerEdit(db, order.publicRef, userId, EDITED);
    await approveLyrics(db, order.publicRef, userId);

    expect(await statusOf(order.id)).toBe("lyrics_approved");
    const [latest] = await db
      .select()
      .from(lyricsVersions)
      .where(eq(lyricsVersions.orderId, order.id))
      .orderBy(sql`${lyricsVersions.version} desc`)
      .limit(1);
    expect(latest).toMatchObject({ version: 2, title: "Mein eigener Titel" });
    expect(latest?.approvedAt).toBeInstanceOf(Date);

    expect(await codeOf(saveCustomerEdit(db, order.publicRef, userId, EDITED))).toBe("wrong_status");
    expect(await codeOf(requestAiRevision(db, boss, order.publicRef, userId, null))).toBe("wrong_status");
    expect(await codeOf(approveLyrics(db, order.publicRef, userId))).toBe("wrong_status");
  });
});
