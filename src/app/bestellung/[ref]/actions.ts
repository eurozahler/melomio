"use server";

import { refresh } from "next/cache";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { CheckoutError, startCheckout, type CheckoutErrorCode } from "@/orders/checkout";
import { disableSharePage, enableSharePage } from "@/orders/delivery";
import { getAppPaymentProvider, getWebhookUrl, hashedClientIp } from "@/server/payments";
import { getSessionUser } from "@/server/session";

export type CheckoutResult =
  { ok: true; checkoutUrl: string } | { ok: false; error: CheckoutErrorCode | "generic" };

/**
 * Checkout starten. Von außen direkt aufrufbar – deshalb wird hier alles geprüft:
 * Anmeldung, eigene Bestellung, Status, BEIDE Pflicht-Haken (müssen ausdrücklich true sein).
 */
export async function startCheckoutAction(ref: unknown, accepted: unknown): Promise<CheckoutResult> {
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
