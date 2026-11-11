import { and, eq } from "drizzle-orm";
import { getAffiliateForUser } from "@/affiliates/service";
import { getDb } from "@/db/client";
import { affiliatePayouts } from "@/db/schema";
import { fileResponse } from "@/server/files";
import { getSessionUser } from "@/server/session";

/** Partner: eigene Gutschrift als PDF. */
export async function GET(_request: Request, { params }: RouteContext<"/api/partner/gutschrift/[number]">) {
  const user = await getSessionUser();
  if (!user?.emailVerified) return new Response("Nicht angemeldet", { status: 401 });
  const { number } = await params;
  const db = getDb();
  const affiliate = await getAffiliateForUser(db, user.id);
  if (!affiliate) return new Response("Nicht gefunden", { status: 404 });
  const [payout] = await db
    .select()
    .from(affiliatePayouts)
    .where(and(eq(affiliatePayouts.number, number), eq(affiliatePayouts.affiliateId, affiliate.id)));
  if (!payout) return new Response("Nicht gefunden", { status: 404 });
  return fileResponse(payout.storageKey, {
    contentType: "application/pdf",
    filename: `${payout.number}.pdf`,
    download: false,
  });
}
