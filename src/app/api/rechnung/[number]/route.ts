import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { invoices } from "@/db/schema";
import { fileResponse } from "@/server/files";
import { getSessionUser } from "@/server/session";

/**
 * Rechnung (PDF) für Kunden: nur angemeldet und nur die eigene Rechnung.
 * Fremde Rechnungen sind von unbekannten nicht unterscheidbar (404).
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/rechnung/[number]">) {
  const { number } = await params;
  if (!/^(TEST-)?(RE|ST)-\d{4}-\d{5}$/.test(number)) return new Response("Nicht gefunden", { status: 404 });
  const user = await getSessionUser();
  if (!user?.emailVerified) return new Response("Nicht angemeldet", { status: 401 });
  const [invoice] = await getDb()
    .select()
    .from(invoices)
    .where(and(eq(invoices.number, number), eq(invoices.userId, user.id)));
  if (!invoice) return new Response("Nicht gefunden", { status: 404 });
  return fileResponse(invoice.storageKey, {
    contentType: "application/pdf",
    filename: `Rechnung-${invoice.number}.pdf`,
    download: false,
  });
}
