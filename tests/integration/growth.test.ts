import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm, stat } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import {
  applyAsAffiliate,
  createAffiliateCode,
  createPayout,
  decideAffiliate,
  getAffiliateDashboard,
  markPayoutPaid,
} from "@/affiliates/service";
import { seed } from "@/db/seed";
import {
  affiliateCommissions,
  consents,
  devMailbox,
  musicJobs,
  orders,
  priceSnapshots,
  publications,
  selectedTracks,
  users,
  videos,
} from "@/db/schema";
import { createBoss } from "@/jobs/boss";
import {
  handleMusicExtra,
  handleOrderPaid,
  handlePublicationRender,
  handleVideoRender,
} from "@/jobs/handlers";
import { QUEUES } from "@/jobs/queues";
import { autoChooseExpired, chooseVersion, listSongVersions } from "@/jobs/versions";
import { processPaymentUpdate, startCheckout } from "@/orders/checkout";
import { refundOrder } from "@/orders/refund";
import { transitionOrder } from "@/orders/service";
import { createMockPaymentProvider, setMockPaymentStatus } from "@/payments/mock";
import { approvePublication, uploadPublication, withdrawPublication } from "@/publishing/service";
import { getPublishTarget } from "@/publishing/target";
import { getEnv } from "@/config/env";
import {
  connectTestDb,
  createUserWithOrder,
  orderWithRealPreview,
  setSetting,
  TEST_STORAGE_DIR,
  testDeps,
  useShortSongs,
} from "./helpers";

const { db, pool } = connectTestDb();
let boss: PgBoss;
const BASE = "http://localhost:3200";
const provider = () => createMockPaymentProvider(db, BASE);
const tag = Date.now().toString(36).toUpperCase();

beforeAll(async () => {
  await seed(db);
  await useShortSongs(db);
  boss = createBoss(process.env.DATABASE_URL_TEST!, "sender");
  await boss.start();
});

afterAll(async () => {
  await setSetting(db, "music_extra_candidates_after_purchase", 1);
  await setSetting(db, "publication_discount_pct", 0);
  await boss.stop({ graceful: false });
  await pool.end();
  await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
});

async function statusOf(orderId: string) {
  const [o] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  return o?.status;
}

async function buy(
  publicRef: string,
  userId: string,
  opts: { code?: string | null; publication?: unknown } = {},
) {
  const url = await startCheckout(db, provider(), {
    publicRef,
    userId,
    accepted: { termsPrivacy: true, withdrawalWaiver: true },
    ipHash: null,
    baseUrl: BASE,
    webhookUrl: null,
    voucherCode: opts.code ?? null,
    publication: opts.publication ?? null,
    boss,
  });
  if (url.includes("/dev/zahlung/")) {
    const id = url.split("/dev/zahlung/")[1]!;
    await setMockPaymentStatus(db, id, "paid");
    await processPaymentUpdate(db, boss, provider(), id, "webhook");
  }
}

describe("Zweite Song-Version nach dem Kauf", () => {
  it("nach der Zahlung entsteht Version 2, Kunde wählt, Video mit seiner Wahl", async () => {
    await setSetting(db, "music_extra_candidates_after_purchase", 1);
    const { userId, order } = await orderWithRealPreview(db, boss);
    await buy(order.publicRef, userId);
    const deps = testDeps(db, boss);

    await handleOrderPaid(deps, { orderId: order.id });
    expect(await statusOf(order.id)).toBe("paid");
    const queued = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from pgboss.job where name = ${QUEUES.musicExtra} and data->>'orderId' = ${order.id}`,
    );
    expect(queued.rows[0]?.n).toBe(1);

    await handleMusicExtra(deps, { orderId: order.id });
    expect(await statusOf(order.id)).toBe("awaiting_choice");
    const versions = await listSongVersions(db, order.id);
    expect(versions.map((v) => v.label)).toEqual([1, 2]);
    const [job] = await db
      .select()
      .from(musicJobs)
      .where(and(eq(musicJobs.orderId, order.id), eq(musicJobs.phase, "post_purchase")));
    expect(job?.status).toBe("succeeded");

    // E-Mail „Version wählen“ genau einmal
    await handleMusicExtra(deps, { orderId: order.id });
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const mails = await db
      .select()
      .from(devMailbox)
      .where(and(eq(devMailbox.recipient, user!.email), eq(devMailbox.template, "version-choice")));
    expect(mails).toHaveLength(1);

    // Fremde dürfen nicht wählen, unbekannte Kandidaten auch nicht
    await expect(
      chooseVersion(db, boss, {
        publicRef: order.publicRef,
        userId: "fremd",
        candidateId: versions[1]!.candidateId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      chooseVersion(db, boss, {
        publicRef: order.publicRef,
        userId,
        candidateId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toMatchObject({ code: "unknown_version" });

    await chooseVersion(db, boss, {
      publicRef: order.publicRef,
      userId,
      candidateId: versions[1]!.candidateId,
    });
    expect(await statusOf(order.id)).toBe("video_rendering");
    const [selected] = await db.select().from(selectedTracks).where(eq(selectedTracks.orderId, order.id));
    expect(selected).toMatchObject({ candidateId: versions[1]!.candidateId, selectedBy: "customer" });
  }, 240_000);

  it("schlägt die zweite Version fehl, entsteht das Video sofort mit der Hörproben-Version", async () => {
    const { userId, order } = await orderWithRealPreview(db, boss);
    await buy(order.publicRef, userId);
    const deps = testDeps(db, boss);
    await handleOrderPaid(deps, { orderId: order.id });
    process.env.MOCK_MUSIC_MODE = "silent";
    try {
      await handleMusicExtra(deps, { orderId: order.id });
    } finally {
      delete process.env.MOCK_MUSIC_MODE;
    }
    expect(await statusOf(order.id)).toBe("video_rendering");
    const [selected] = await db.select().from(selectedTracks).where(eq(selectedTracks.orderId, order.id));
    expect(selected?.selectedBy).toBe("auto");
  }, 240_000);

  it("ohne Auswahl nach Ablauf der Frist: automatisch die Hörproben-Version", async () => {
    const { userId, order } = await orderWithRealPreview(db, boss);
    await buy(order.publicRef, userId);
    const deps = testDeps(db, boss);
    await handleOrderPaid(deps, { orderId: order.id });
    await handleMusicExtra(deps, { orderId: order.id });
    expect(await statusOf(order.id)).toBe("awaiting_choice");
    expect(await autoChooseExpired(db, boss)).toBe(0);
    const in8Days = new Date(Date.now() + 8 * 86_400_000);
    expect(await autoChooseExpired(db, boss, in8Days)).toBeGreaterThanOrEqual(1);
    expect(await statusOf(order.id)).toBe("video_rendering");
  }, 240_000);
});

describe("Veröffentlichung (C7)", () => {
  it("Zustimmung mit Rabatt → Fassung ohne Fotos/Titel → Freigabe → Upload → Widerruf entfernt die Datei", async () => {
    await setSetting(db, "music_extra_candidates_after_purchase", 0);
    await setSetting(db, "publication_discount_pct", 10);
    const { userId, order } = await orderWithRealPreview(db, boss);
    await buy(order.publicRef, userId, { publication: { consent: true, photos: false, title: false } });

    const [snap] = await db.select().from(priceSnapshots).where(eq(priceSnapshots.orderId, order.id));
    expect(snap?.items.map((i) => i.productSlug)).toEqual(["song", "publication"]);
    expect(snap?.grossCents).toBe(
      snap!.items[0]!.unitGrossCents - Math.round(snap!.items[0]!.unitGrossCents / 10),
    );
    const given = await db
      .select({ type: consents.type })
      .from(consents)
      .where(eq(consents.orderId, order.id));
    expect(given.map((c) => c.type)).toContain("publication");
    expect(given.map((c) => c.type)).not.toContain("publication_photos");

    const deps = testDeps(db, boss);
    await handleOrderPaid(deps, { orderId: order.id });
    await handleVideoRender(deps, { orderId: order.id });
    expect(await statusOf(order.id)).toBe("completed");
    const [pub] = await db.select().from(publications).where(eq(publications.orderId, order.id));
    // ohne Titel → eigene Fassung nötig
    expect(pub?.status).toBe("rendering");

    await handlePublicationRender(deps, { orderId: order.id });
    const [ready] = await db.select().from(publications).where(eq(publications.orderId, order.id));
    expect(ready?.status).toBe("awaiting_approval");
    const [pubVideo] = await db.select().from(videos).where(eq(videos.id, ready!.videoId!));
    expect(pubVideo?.variant).toBe("publication");

    const [admin] = await db
      .insert(users)
      .values({ id: `pub-admin-${tag}`, email: `pub-admin-${tag}@example.invalid` })
      .returning();
    await approvePublication(db, boss, ready!.id, admin!.id);
    const target = getPublishTarget(db, getEnv(), deps.storage);
    expect(target.name).toBe("storage");
    expect(await uploadPublication({ db, storage: deps.storage, target }, order.id)).toMatch(/^hochgeladen/);
    const [uploaded] = await db.select().from(publications).where(eq(publications.orderId, order.id));
    expect(uploaded?.status).toBe("uploaded");
    expect(uploaded?.remotePath).toMatch(
      new RegExp(`^veroeffentlicht/melomio/\\d{4}-\\d{2}-\\d{2}-${order.publicRef}\\.mp4$`),
    );
    await stat(`${TEST_STORAGE_DIR}/${uploaded!.remotePath}`);

    expect(await withdrawPublication(db, target, order.id, userId)).toBe(true);
    const [withdrawn] = await db.select().from(publications).where(eq(publications.orderId, order.id));
    expect(withdrawn?.status).toBe("withdrawn");
    await expect(stat(`${TEST_STORAGE_DIR}/${uploaded!.remotePath}`)).rejects.toThrow();
    const revoked = await db
      .select()
      .from(consents)
      .where(and(eq(consents.orderId, order.id), eq(consents.type, "publication")));
    expect(revoked.every((c) => c.revokedAt !== null)).toBe(true);
  }, 300_000);

  it("Veröffentlichung abgeschaltet → Zustimmung wird abgelehnt", async () => {
    await setSetting(db, "publication_enabled", 0);
    try {
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
      await expect(buy(order.publicRef, userId, { publication: { consent: true } })).rejects.toMatchObject({
        code: "publication_invalid",
      });
    } finally {
      await setSetting(db, "publication_enabled", 1);
    }
  });
});

describe("Affiliate-Programm", () => {
  const application = {
    fullName: "Anna Partner",
    company: "",
    street: "Hauptstraße 1",
    postalCode: "10115",
    city: "Berlin",
    channels: "Instagram @anna (5.000 Follower)",
    accountHolder: "Anna Partner",
    iban: "DE89 3704 0044 0532 0130 00",
    taxStatus: "vat_registered",
    vatId: "DE123456789",
    taxNumber: "",
    termsAccepted: true,
  };

  it("Bewerbung → Freigabe → Code → Kauf mit Rabatt → Provision → Erstattung storniert sie", async () => {
    await setSetting(db, "music_extra_candidates_after_purchase", 0);
    const partnerId = `partner-${tag}`;
    await db.insert(users).values({ id: partnerId, email: `${partnerId}@example.invalid` });
    await expect(
      applyAsAffiliate(db, partnerId, { ...application, iban: "DE00 1234" }),
    ).rejects.toMatchObject({
      code: "invalid",
    });
    const affiliate = await applyAsAffiliate(db, partnerId, application);
    expect(affiliate.status).toBe("pending");
    await expect(createAffiliateCode(db, partnerId, `ANNA${tag}`)).rejects.toMatchObject({
      code: "wrong_status",
    });
    await decideAffiliate(db, affiliate.id, "active", partnerId);
    const code = await createAffiliateCode(db, partnerId, `anna-${tag}`);
    expect(code.code).toBe(`ANNA-${tag}`);
    await expect(createAffiliateCode(db, partnerId, `ANNA-${tag}`)).rejects.toMatchObject({
      code: "code_taken",
    });

    // Kauf mit dem Code: 10 % Rabatt (Standard), Provision 15 % vom Netto
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
    await buy(order.publicRef, userId, { code: code.code });
    const [snap] = await db.select().from(priceSnapshots).where(eq(priceSnapshots.orderId, order.id));
    expect(snap?.items[1]).toMatchObject({ productSlug: "affiliate", unitGrossCents: -100 });
    await handleOrderPaid(testDeps(db, boss), { orderId: order.id }).catch(() => undefined);
    const [commission] = await db
      .select()
      .from(affiliateCommissions)
      .where(eq(affiliateCommissions.orderId, order.id));
    expect(commission).toMatchObject({
      affiliateId: affiliate.id,
      baseNetCents: snap!.netCents,
      commissionPct: 15,
      commissionCents: Math.round((snap!.netCents * 15) / 100),
      status: "pending",
    });

    // Eigener Code gilt nicht
    const own = await createUserWithOrder(db);
    await expect(
      startCheckout(db, provider(), {
        publicRef: own.order.publicRef,
        userId: partnerId,
        accepted: { termsPrivacy: true, withdrawalWaiver: true },
        ipHash: null,
        baseUrl: BASE,
        webhookUrl: null,
        voucherCode: code.code,
      }),
    ).rejects.toBeTruthy();

    // Erstattung → Provision storniert
    await refundOrder(db, provider(), testDeps(db, boss).storage, order.publicRef, partnerId, "Test");
    const [canceled] = await db
      .select()
      .from(affiliateCommissions)
      .where(eq(affiliateCommissions.orderId, order.id));
    expect(canceled?.status).toBe("canceled");
  }, 120_000);

  it("fällige Provisionen → Gutschrift mit 19 % USt. (GS-Nummer, PDF) → als überwiesen markiert", async () => {
    const partnerId = `partner2-${tag}`;
    await db.insert(users).values({ id: partnerId, email: `${partnerId}@example.invalid` });
    const affiliate = await applyAsAffiliate(db, partnerId, { ...application, fullName: "Ben Partner" });
    await decideAffiliate(db, affiliate.id, "active", partnerId);
    const code = await createAffiliateCode(db, partnerId, null);
    expect(code.code).toMatch(/^BENPARTNER\d{3}$/);

    for (let i = 0; i < 2; i++) {
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
      await buy(order.publicRef, userId, { code: code.code });
      await handleOrderPaid(testDeps(db, boss), { orderId: order.id }).catch(() => undefined);
    }
    const storage = testDeps(db, boss).storage;
    // noch in der Wartezeit
    await expect(createPayout(db, storage, affiliate.id, partnerId, { isTest: true })).rejects.toMatchObject({
      code: "nothing_due",
    });
    const later = new Date(Date.now() + 31 * 86_400_000);
    const dash = await getAffiliateDashboard(db, affiliate.id, later);
    expect(dash.totals.due).toBeGreaterThan(0);

    const payout = await createPayout(db, storage, affiliate.id, partnerId, { isTest: true, now: later });
    expect(payout.number).toMatch(/^TEST-GS-\d{4}-\d{5}$/);
    expect(payout.netCents).toBe(dash.totals.due);
    expect(payout.taxCents).toBe(Math.round(payout.netCents * 0.19));
    const pdf = await stat(`${TEST_STORAGE_DIR}/${payout.storageKey}`);
    expect(pdf.size).toBeGreaterThan(1000);
    // dieselben Provisionen nicht zweimal abrechnen
    await expect(
      createPayout(db, storage, affiliate.id, partnerId, { isTest: true, now: later }),
    ).rejects.toMatchObject({ code: "nothing_due" });

    await markPayoutPaid(db, payout.id, partnerId);
    const paid = await db
      .select()
      .from(affiliateCommissions)
      .where(eq(affiliateCommissions.payoutId, payout.id));
    expect(paid).toHaveLength(2);
    expect(paid.every((c) => c.status === "paid")).toBe(true);
    await expect(markPayoutPaid(db, payout.id, partnerId)).rejects.toMatchObject({ code: "wrong_status" });
  }, 120_000);
});
