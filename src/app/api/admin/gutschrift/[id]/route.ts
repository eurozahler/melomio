import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { affiliatePayouts } from "@/db/schema";
import { getAdminUser } from "@/server/admin";
import { fileResponse } from "@/server/files";

/** Admin: Gutschrift einer Affiliate-Auszahlung als PDF. */
export async function GET(_request: Request, { params }: RouteContext<"/api/admin/gutschrift/[id]">) {
  const admin = await getAdminUser();
  if (!admin) return new Response("Nicht gefunden", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const [payout] = await getDb().select().from(affiliatePayouts).where(eq(affiliatePayouts.id, id));
  if (!payout) return new Response("Nicht gefunden", { status: 404 });
  return fileResponse(payout.storageKey, {
    contentType: "application/pdf",
    filename: `${payout.number}.pdf`,
    download: false,
  });
}
