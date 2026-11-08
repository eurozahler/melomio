import { getDb } from "@/db/client";
import { processPaymentUpdate } from "@/orders/checkout";
import { getSenderBoss } from "@/server/jobs";
import { getAppPaymentProvider } from "@/server/payments";

/**
 * Zahlungs-Webhook (Mollie, klassisch): Der Anbieter schickt nur die Zahlungs-ID („id=tr_…“).
 * Der Status wird IMMER selbst beim Anbieter abgefragt – eine gefälschte Benachrichtigung bewirkt
 * also nichts. Antwort immer 200, damit nichts über bestehende Zahlungen verraten wird.
 */
export async function POST(request: Request) {
  let id: string | null = null;
  try {
    const form = await request.formData();
    const value = form.get("id");
    id = typeof value === "string" ? value.trim() : null;
  } catch {
    id = null;
  }
  if (!id || id.length > 100) return new Response(null, { status: 200 });

  try {
    await processPaymentUpdate(getDb(), await getSenderBoss(), getAppPaymentProvider(), id, "webhook");
  } catch (error) {
    // Fehler beim Anbieter oder in der Datenbank: 500, damit Mollie es später erneut versucht
    console.error("[Zahlungs-Webhook]", error);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
}
