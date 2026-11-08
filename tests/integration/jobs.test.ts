import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { seed } from "@/db/seed";
import { answers, jobExecutions, orderStatusHistory, orders, questionnaireDrafts } from "@/db/schema";
import { emptyDraft, type DraftData } from "@/domain/draft";
import { IllegalTransitionError } from "@/domain/order-status";
import { createBoss } from "@/jobs/boss";
import { handleLyricsGenerate, handleOrderStart } from "@/jobs/handlers";
import { runIdempotent } from "@/jobs/idempotency";
import { QUEUES } from "@/jobs/queues";
import {
  createOrderFromDraft,
  MAX_OPEN_UNPAID_ORDERS,
  ownLyricsToContent,
  TooManyOpenOrdersError,
  transitionOrder,
} from "@/orders/service";
import { getQuestionnaireForTest } from "./catalog-helper";
import { connectTestDb, createUserWithOrder, testDeps } from "./helpers";

const { db, pool } = connectTestDb();
let boss: PgBoss;

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
  const [o] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  return o?.status;
}

async function queuedJobs(queue: string, orderId: string) {
  const r = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from pgboss.job where name = ${queue} and data->>'orderId' = ${orderId}`,
  );
  return r.rows[0]?.n ?? 0;
}

describe("Idempotenz (Abnahme M4)", () => {
  it("ein Schritt mit gleichem Schlüssel läuft nur einmal", async () => {
    let calls = 0;
    const work = async () => ++calls;
    const first = await runIdempotent(db, "test:einmal", work);
    const second = await runIdempotent(db, "test:einmal", work);
    expect(first.status).toBe("executed");
    expect(second.status).toBe("skipped");
    expect(calls).toBe(1);
  });

  it("gleichzeitige Aufrufe führen den Schritt nicht doppelt aus", async () => {
    let calls = 0;
    const slow = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 300));
    };
    const results = await Promise.all([
      runIdempotent(db, "test:parallel", slow),
      runIdempotent(db, "test:parallel", slow),
    ]);
    expect(calls).toBe(1);
    expect(results.map((r) => r.status).sort()).toEqual(["busy", "executed"]);
  });

  it("nach einem Fehler ist ein neuer Versuch möglich", async () => {
    let calls = 0;
    await expect(
      runIdempotent(db, "test:fehler", async () => {
        calls++;
        throw new Error("Anbieter nicht erreichbar");
      }),
    ).rejects.toThrow();
    const retry = await runIdempotent(db, "test:fehler", async () => ++calls);
    expect(retry.status).toBe("executed");
    expect(calls).toBe(2);
  });

  it("ein abgestürzter Schritt („läuft“ seit langer Zeit) wird erneut ausgeführt", async () => {
    await db.insert(jobExecutions).values({
      idempotencyKey: "test:absturz",
      status: "running",
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const result = await runIdempotent(db, "test:absturz", async () => "neu ausgeführt");
    expect(result).toEqual({ status: "executed", value: "neu ausgeführt" });
  });
});

describe("Wiederaufnahme nach einem Absturz des Workers", () => {
  it("ein NEUER Versuch aus der Warteschlange übernimmt einen „laufenden“ Schritt sofort", async () => {
    // Zustand nach einem Absturz: Schritt steht seit eben auf „läuft“, Versuch 0 von Auftrag job-1
    await db.insert(jobExecutions).values({
      idempotencyKey: "test:übernahme",
      status: "running",
      attemptToken: "job-1:0",
      startedAt: new Date(),
    });
    // derselbe Versuch → läuft schon
    expect((await runIdempotent(db, "test:übernahme", async () => 1, { attempt: "job-1:0" })).status).toBe(
      "busy",
    );
    // pg-boss hat den Versuch für abgestürzt erklärt und gibt Versuch 1 aus → darf übernehmen
    const retry = await runIdempotent(db, "test:übernahme", async () => "fertig", { attempt: "job-1:1" });
    expect(retry).toEqual({ status: "executed", value: "fertig" });
  });

  it("„läuft schon“ wird nie still als erledigt gemeldet, sondern als Fehler (pg-boss versucht es erneut)", async () => {
    const { order } = await createUserWithOrder(db);
    await db.insert(jobExecutions).values({
      idempotencyKey: `order.start:${order.id}`,
      status: "running",
      attemptToken: "job-9:0",
      startedAt: new Date(),
    });
    await expect(handleOrderStart(testDeps(db, boss), { orderId: order.id }, "job-9:0")).rejects.toThrow(
      /läuft bereits/,
    );
    expect(await statusOf(order.id)).toBe("created");
  });
});

describe("Statuswechsel in der Datenbank (Abnahme M4)", () => {
  it("unerlaubte Sprünge werden abgelehnt, der Status bleibt unverändert", async () => {
    const { order } = await createUserWithOrder(db);
    await expect(transitionOrder(db, order.id, "video_rendering", { actor: "test" })).rejects.toBeInstanceOf(
      IllegalTransitionError,
    );
    await expect(transitionOrder(db, order.id, "paid", { actor: "test" })).rejects.toThrow();
    expect(await statusOf(order.id)).toBe("created");
  });

  it("erlaubte Wechsel landen mit Auslöser und Grund in der Historie", async () => {
    const { order } = await createUserWithOrder(db);
    await transitionOrder(db, order.id, "lyrics_generating", { actor: "worker", reason: "Test" });
    const history = await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order.id));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromStatus: "created",
      toStatus: "lyrics_generating",
      actor: "worker",
    });
  });
});

function completeDraft(overrides: Partial<DraftData["choices"]> = {}): DraftData {
  return {
    ...emptyDraft(),
    answers: {
      recipient_name: "Lena",
      relationship: "freund",
      round_birthday: "nein",
      traits: "Lacht gern.",
    },
    choices: {
      ...emptyDraft().choices,
      genre: "pop",
      mood: "froehlich",
      voice: "weiblich_sanft",
      ...overrides,
    },
  };
}

describe("Bestellung aus Entwurf anlegen", () => {
  it("legt Bestellung, Antworten, Historie und Startauftrag an und verbraucht den Entwurf", async () => {
    const { userId } = await createUserWithOrder(db); // Benutzer (mit einer alten Bestellung)
    const q = await getQuestionnaireForTest(db, "geburtstag");
    await db.insert(questionnaireDrafts).values({
      cookieId: "c".repeat(43),
      userId,
      occasionId: q.occasion.id,
      data: completeDraft(),
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const order = await createOrderFromDraft(db, boss, {
      userId,
      occasionId: q.occasion.id,
      occasionName: q.occasion.name,
      questionnaireVersionId: q.versionId,
      questions: q.questions,
      draft: completeDraft(),
      isTest: true,
      draftCookieId: "c".repeat(43),
    });

    expect(order.publicRef).toMatch(/^M-[A-HJ-NP-Z2-9]{6}$/);
    expect(order.status).toBe("created");
    expect(await db.select().from(answers).where(eq(answers.orderId, order.id))).toHaveLength(4);
    expect(await queuedJobs(QUEUES.orderStart, order.id)).toBe(1);
    expect(
      await db.select().from(questionnaireDrafts).where(eq(questionnaireDrafts.userId, userId)),
    ).toHaveLength(0);
  });

  it("begrenzt offene, unbezahlte Bestellungen pro Konto", async () => {
    const { userId } = await createUserWithOrder(db); // 1 offene
    const q = await getQuestionnaireForTest(db, "geburtstag");
    const input = {
      userId,
      occasionId: q.occasion.id,
      occasionName: q.occasion.name,
      questionnaireVersionId: q.versionId,
      questions: q.questions,
      draft: completeDraft(),
      isTest: true,
    };
    for (let i = 1; i < MAX_OPEN_UNPAID_ORDERS; i++) await createOrderFromDraft(db, boss, input);
    await expect(createOrderFromDraft(db, boss, input)).rejects.toBeInstanceOf(TooManyOpenOrdersError);
  });

  it("eigener Songtext: Abschnitte werden an Leerzeilen getrennt", () => {
    expect(ownLyricsToContent("Zeile 1\nZeile 2\n\nRefrain\n\n\n").sections).toEqual([
      { type: "verse", lines: ["Zeile 1", "Zeile 2"] },
      { type: "verse", lines: ["Refrain"] },
    ]);
  });
});

describe("Arbeitsschritte des Workers", () => {
  it("order.start → Songtext wird angestoßen; ein doppelter Auftrag bewirkt nichts", async () => {
    const { order } = await createUserWithOrder(db);
    const first = await handleOrderStart(testDeps(db, boss), { orderId: order.id });
    const second = await handleOrderStart(testDeps(db, boss), { orderId: order.id });
    expect(first.status).toBe("executed");
    expect(second.status).toBe("skipped");
    expect(await statusOf(order.id)).toBe("lyrics_generating");
    expect(await queuedJobs(QUEUES.lyricsGenerate, order.id)).toBe(1);
  });

  it("lyrics.generate → Songtext bereit zur Prüfung", async () => {
    const { order } = await createUserWithOrder(db);
    await handleOrderStart(testDeps(db, boss), { orderId: order.id });
    await handleLyricsGenerate(testDeps(db, boss), { orderId: order.id });
    expect(await statusOf(order.id)).toBe("lyrics_review");
  });

  it("ein verspäteter Auftrag für eine schon weitergelaufene Bestellung ändert nichts", async () => {
    const { order } = await createUserWithOrder(db);
    await transitionOrder(db, order.id, "lyrics_generating", { actor: "test" });
    await transitionOrder(db, order.id, "lyrics_review", { actor: "test" });
    const result = await handleLyricsGenerate(testDeps(db, boss), { orderId: order.id });
    expect(result).toMatchObject({ status: "executed", value: expect.stringMatching(/übersprungen/) });
    expect(await statusOf(order.id)).toBe("lyrics_review");
  });
});
