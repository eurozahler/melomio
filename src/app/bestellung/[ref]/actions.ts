"use server";

import { refresh } from "next/cache";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { CheckoutError, startCheckout, type CheckoutErrorCode } from "@/orders/checkout";
import { disableSharePage, enableSharePage } from "@/orders/delivery";
import { getAppPaymentProvider, getWebhookUrl, hashedClientIp } from "@/server/payments";
import { removePhoto } from "@/orders/photos";
import { discountFor, findValidVoucher } from "@/orders/vouchers";
import { getSongPrice } from "@/server/catalog";
import { getSenderBoss } from "@/server/jobs";
import { getSessionUser } from "@/server/session";
import { getStorage } from "@/storage";

export type CheckoutResult =
  { ok: true; checkoutUrl: string } | { ok: false; error: CheckoutErrorCode | "generic" };

/**
 * Checkout starten. Von außen direkt aufrufbar – deshalb wird hier alles geprüft:
 * Anmeldung, eigene Bestellung, Status, BEIDE Pflicht-Haken (müssen ausdrücklich true sein).
 */
export async function startCheckoutAction(
  ref: unknown,
  accepted: unknown,
  billing?: unknown,
  voucherCode?: unknown,
): Promise<CheckoutResult> {
  const user = await getSessionUser();
  if (!user?.emailVerified || typeof ref !== "string") return { ok: false, error: "not_found" };
  const a = (accepted ?? {}) as { termsPrivacy?: unknown; withdrawalWaiver?: unknown };
  try {
    const checkoutUrl = await startCheckout(getDb(), getAppPaymentProvider(), {
      publicRef: ref,
      userId: user.id,
      accepted: { termsPrivacy: a.termsPrivacy === true, withdrawalWaiver: a.withdrawalWaiver === true },
      ipHash: await hashedClientIp(),
      baseUrl: getEnv().APP_BASE_URL,
      webhookUrl: getWebhookUrl(),
      billing: billing ?? null,
      voucherCode: typeof voucherCode === "string" ? voucherCode : null,
      boss: await getSenderBoss(),
    });
    return { ok: true, checkoutUrl };
  } catch (error) {
    if (error instanceof CheckoutError) return { ok: false, error: error.code };
    console.error("[Checkout]", error);
    return { ok: false, error: "generic" };
  }
}

/** Song-Seite einschalten (nur eigene, bezahlte Bestellung). */
export async function enableShareAction(ref: unknown): Promise<void> {
  const user = await getSessionUser();
  if (!user?.emailVerified || typeof ref !== "string") return;
  await enableSharePage(getDb(), ref, user.id);
  refresh();
}

/** Song-Seite abschalten – der Link funktioniert danach nicht mehr. */
export async function disableShareAction(ref: unknown): Promise<void> {
  const user = await getSessionUser();
  if (!user?.emailVerified || typeof ref !== "string") return;
  await disableSharePage(getDb(), ref, user.id);
  refresh();
}

export type VoucherPreview = { ok: true; discountCents: number; grossCents: number } | { ok: false };

/** Gutschein vorab prüfen und den neuen Preis anzeigen (es wird noch nichts gespeichert). */
export async function previewVoucherAction(code: unknown): Promise<VoucherPreview> {
  const user = await getSessionUser();
  if (!user?.emailVerified || typeof code !== "string") return { ok: false };
  const db = getDb();
  const voucher = await findValidVoucher(db, code);
  const price = await getSongPrice();
  if (!voucher || !price) return { ok: false };
  const discountCents = discountFor(price.grossCents, voucher);
  return { ok: true, discountCents, grossCents: price.grossCents - discountCents };
}

/** Foto aus der Bestellung entfernen (vor dem Kauf). */
export async function removePhotoAction(ref: unknown, photoId: unknown): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user?.emailVerified || typeof ref !== "string" || typeof photoId !== "string") return { ok: false };
  try {
    await removePhoto(getDb(), getStorage(getEnv()), ref, user.id, photoId);
    refresh();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
