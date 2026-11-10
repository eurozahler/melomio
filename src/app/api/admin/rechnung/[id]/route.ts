import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { invoices } from "@/db/schema";
import { getAdminUser } from "@/server/admin";
import { fileResponse } from "@/server/files";

/** Rechnung (PDF) für den Admin. Ohne Admin-Rolle: 404. */
export async function GET(_request: Request, { params }: RouteContext<"/api/admin/rechnung/[id]">) {
  const { id } = await params;
  if (!(await getAdminUser()) || !/^[0-9a-f-]{36}$/i.test(id))
    return new Response("Nicht gefunden", { status: 404 });
  const [invoice] = await getDb().select().from(invoices).where(eq(invoices.id, id));
  if (!invoice) return new Response("Nicht gefunden", { status: 404 });
  return fileResponse(invoice.storageKey, {
    contentType: "application/pdf",
    filename: `Rechnung-${invoice.number}.pdf`,
    download: false,
  });
}
