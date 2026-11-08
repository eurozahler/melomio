// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { eq, ne } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import {
  AdminActionError,
  approveCandidate,
  getCurrentSongPrice,
  getKpis,
  getOrderDetail,
  grantRole,
  isAdmin,
  listAudit,
  listOrders,
  listSettings,
  retryFailedOrder,
  updateSetting,
  updateSongPrice,
} from "@/admin/service";
import { getSetting } from "@/db/settings-store";
import { seed } from "@/db/seed";
import { appSettings, musicCandidates, orders, prices, users } from "@/db/schema";
import { createBoss } from "@/jobs/boss";
import { handleLyricsGenerate } from "@/jobs/handlers";
import { QualityCheckFailedError, runPreviewMusic } from "@/jobs/music";
import { approveLyrics } from "@/orders/lyrics";
import { transitionOrder } from "@/orders/service";
import { connectTestDb, createUserWithOrder, TEST_STORAGE_DIR, testDeps, useShortSongs } from "./helpers";

const { db, pool } = connectTestDb();
let boss: PgBoss;
let adminId: string;

beforeAll(async () => {
  await seed(db);
  await useShortSongs(db);
  boss = createBoss(process.env.DATABASE_URL_TEST!, "sender");
  await boss.start();
  adminId = randomUUID();
  await db.insert(users).values({ id: adminId, email: `admin-${adminId}@example.invalid` });
  await grantRole(db, `admin-${adminId}@example.invalid`, "admin");
});

afterAll(async () => {
  delete process.env.MOCK_MUSIC_MODE;
  await boss.stop({ graceful: false });
  await pool.end();
  await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
});

async function statusOf(orderId: string) {
  const [o] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  return o?.status;
}

/** Bestellung, deren erster Musikversuch an der Prüfung scheitert (stumme Datei). */
async function orderWithRejectedMusic() {
  const { userId, order } = await createUserWithOrder(db);
  const deps = testDeps(db, boss);
  await transitionOrder(db, order.id, "lyrics_generating", { actor: "test" });
  await handleLyricsGenerate(deps, { orderId: order.id, targetVersion: 1 });
  await approveLyrics(db, boss, order.publicRef, userId);
  process.env.MOCK_MUSIC_MODE = "silent";
  await expect(runPreviewMusic(deps, order.id)).rejects.toBeInstanceOf(QualityCheckFailedError);
  delete process.env.MOCK_MUSIC_MODE;
  return { userId, order, deps };
}

describe("Admin", () => {
  it("erkennt die Admin-Rolle und schreibt die Vergabe ins Protokoll", async () => {
    expect(await isAdmin(db, adminId)).toBe(true);
    const { userId } = await createUserWithOrder(db);
    expect(await isAdmin(db, userId)).toBe(false);
    const log = await listAudit(db, 100);
    expect(log.some((l) => l.log.action === "role.grant" && l.log.entityId === adminId)).toBe(true);
  });

  it("listet und filtert Bestellungen und zeigt Kennzahlen", async () => {
    const { order } = await createUserWithOrder(db);
    const byRef = await listOrders(db, { q: order.publicRef });
    expect(byRef.map((o) => o.publicRef)).toEqual([order.publicRef]);
    const created = await listOrders(db, { status: "created" }, 500);
    expect(created.every((o) => o.status === "created")).toBe(true);
    const kpis = await getKpis(db);
    expect(kpis.previewsTotal).toBeGreaterThanOrEqual(0);
    expect(await getOrderDetail(db, "M-GIBTSNICHT")).toBeNull();
  });

  it("„Schritt wiederholen“ bringt eine fehlgeschlagene Bestellung zur Hörprobe", async () => {
    const { order, deps } = await orderWithRejectedMusic();
    await transitionOrder(db, order.id, "failed", {
      actor: "worker",
      reason: "Musik: Prüfung nicht bestanden",
    });
    expect((await listOrders(db, { status: "attention" }, 500)).some((o) => o.id === order.id)).toBe(true);

    const step = await retryFailedOrder(db, boss, order.publicRef, adminId);
    expect(step).toBe("music_generating");
    expect(await statusOf(order.id)).toBe("music_generating");
    await runPreviewMusic(deps, order.id);
    expect(await statusOf(order.id)).toBe("preview_ready");

    await expect(retryFailedOrder(db, boss, order.publicRef, adminId)).rejects.toBeInstanceOf(
      AdminActionError,
    );
    const log = await listAudit(db, 100);
    expect(log.some((l) => l.log.action === "order.retry" && l.log.entityId === order.id)).toBe(true);
  });

  it("„Kandidat freigeben“ nach manueller Prüfung erzeugt die Hörprobe aus genau diesem Kandidaten", async () => {
    const { order, deps } = await orderWithRejectedMusic();
    const detailBefore = await getOrderDetail(db, order.publicRef);
    const candidate = detailBefore!.candidates[0]!.candidate;
    // Prüfung „unsicher“ nachstellen
    await db.update(musicCandidates).set({ qcStatus: "manual" }).where(eq(musicCandidates.id, candidate.id));
    await transitionOrder(db, order.id, "manual_review", { actor: "worker", reason: "unsicher" });

    await approveCandidate(db, boss, order.publicRef, candidate.id, adminId);
    expect(await statusOf(order.id)).toBe("music_generating");
    await runPreviewMusic(deps, order.id);
    expect(await statusOf(order.id)).toBe("preview_ready");
    const detail = await getOrderDetail(db, order.publicRef);
    expect(detail!.candidates).toHaveLength(1); // kein neuer Kandidat erzeugt

    // Fremder Kandidat oder falscher Status wird abgelehnt
    await expect(approveCandidate(db, boss, order.publicRef, candidate.id, adminId)).rejects.toMatchObject({
      code: "wrong_status",
    });
  });

  it("Einstellungen und Preis ändern sich mit Prüfung und Protokoll", async () => {
    await updateSetting(db, "preview_expiry_days", 3, adminId);
    expect(await getSetting(db, "preview_expiry_days")).toBe(3);
    expect((await listSettings(db)).find((s) => s.key === "preview_expiry_days")?.value).toBe(3);
    await expect(updateSetting(db, "preview_expiry_days", -1, adminId)).rejects.toMatchObject({
      code: "invalid",
    });

    const before = await getCurrentSongPrice(db);
    await updateSongPrice(db, 3990, adminId);
    expect((await getCurrentSongPrice(db))?.grossCents).toBe(3990);
    await expect(updateSongPrice(db, 12.5, adminId)).rejects.toMatchObject({ code: "invalid" });

    const log = await listAudit(db, 100);
    expect(
      log.some((l) => l.log.action === "setting.update" && l.log.entityId === "preview_expiry_days"),
    ).toBe(true);
    expect(
      log.some(
        (l) =>
          l.log.action === "price.update" && l.log.oldValue === before?.grossCents && l.log.newValue === 3990,
      ),
    ).toBe(true);
    // aufräumen: nur die ursprüngliche Preiszeile behalten, Einstellung zurücksetzen
    await db.delete(prices).where(ne(prices.grossCents, before!.grossCents));
    await db.update(appSettings).set({ value: 14 }).where(eq(appSettings.key, "preview_expiry_days"));
  });
});
