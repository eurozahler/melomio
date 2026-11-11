"use server";

import { refresh } from "next/cache";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { CheckoutError, startCheckout, type CheckoutErrorCode } from "@/orders/checkout";
import { disableSharePage, enableSharePage } from "@/orders/delivery";
import { getAppPaymentProvider, getWebhookUrl, hashedClientIp } from "@/server/payments";
import { removePhoto } from "@/orders/photos";
import { chooseVersion, VersionChoiceError } from "@/jobs/versions";
import { buildPriceItems, publicationOffer, resolveCode } from "@/orders/pricing";
import { getPriceSnapshot } from "@/orders/checkout";
import { getOwnedOrder } from "@/orders/lyrics";
import { withdrawPublication } from "@/publishing/service";
import { getPublishTarget } from "@/publishing/target";
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
  publication?: unknown,
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
      publication: publication ?? null,
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

export type PricePreview =
  | {
      ok: true;
      lines: Array<{ label: string; cents: number }>;
      grossCents: number;
      codeValid: boolean | null;
    }
  | { ok: false };

/**
 * Preis vorab berechnen (Code und/oder Veröffentlichung) – es wird noch nichts gespeichert.
 * codeValid: null = kein Code eingegeben, false = Code ungültig.
 */
export async function previewPriceAction(
  ref: unknown,
  code: unknown,
  publish: unknown,
): Promise<PricePreview> {
  const user = await getSessionUser();
  if (!user?.emailVerified || typeof ref !== "string") return { ok: false };
  const db = getDb();
  const order = await getOwnedOrder(db, ref, user.id);
  const price = await getSongPrice();
  if (!order || !price) return { ok: false };
  const snapshot = await getPriceSnapshot(db, order.id);
  const base = snapshot?.items.find((i) => i.productSlug === "song")?.unitGrossCents ?? price.grossCents;
  const raw = typeof code === "string" ? code.trim() : "";
  const applied = raw ? await resolveCode(db, raw, { userId: user.id }) : null;
  const offer = await publicationOffer(db, order.occasionId);
  const breakdown = buildPriceItems(
    { productSlug: "song", name: "Song mit Video", unitGrossCents: base },
    { publicationPct: publish === true && offer.enabled ? offer.discountPct : null, code: applied },
  );
  return {
    ok: true,
    lines: breakdown.items.slice(1).map((i) => ({ label: i.name, cents: i.unitGrossCents })),
    grossCents: breakdown.grossCents,
    codeValid: raw ? applied !== null : null,
  };
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

/** Kunde wählt seine Lieblingsversion (zweite Song-Version) → Video startet. */
export async function chooseVersionAction(ref: unknown, candidateId: unknown): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user?.emailVerified || typeof ref !== "string" || typeof candidateId !== "string")
    return { ok: false };
  try {
    await chooseVersion(getDb(), await getSenderBoss(), { publicRef: ref, userId: user.id, candidateId });
    refresh();
    return { ok: true };
  } catch (error) {
    if (!(error instanceof VersionChoiceError)) console.error("[Version]", error);
    return { ok: false };
  }
}

/** Kunde widerruft die Zustimmung zur Veröffentlichung. */
export async function withdrawPublicationAction(ref: unknown): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user?.emailVerified || typeof ref !== "string") return { ok: false };
  const db = getDb();
  const order = await getOwnedOrder(db, ref, user.id);
  if (!order) return { ok: false };
  const env = getEnv();
  await withdrawPublication(db, getPublishTarget(db, env, getStorage(env)), order.id, user.id);
  refresh();
  return { ok: true };
}
