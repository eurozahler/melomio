import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { consents, orders, priceSnapshots, users } from "@/db/schema";
import { CONSENT_TEXTS } from "@/domain/consents";
import { sendEmail } from "@/server/email";
import { orderConfirmationTemplate } from "@/server/email/templates";

/**
 * Nach bestätigter Zahlung (M7): Bestellbestätigung per E-Mail mit Vertragsinhalt und den
 * bestätigten Einwilligungen (E16). In M8 kommt hier das Video dazu.
 */
export async function sendOrderConfirmation(db: Database, baseUrl: string, orderId: string): Promise<string> {
  const [row] = await db
    .select({ order: orders, user: users, snapshot: priceSnapshots })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .innerJoin(priceSnapshots, eq(priceSnapshots.orderId, orders.id))
    .where(eq(orders.id, orderId));
  if (!row) throw new Error(`Bestellung ${orderId} (mit Preis) nicht gefunden`);
  if (!row.order.paidAt) return "übersprungen (nicht bezahlt)";

  const given = await db
    .select()
    .from(consents)
    .where(and(eq(consents.orderId, orderId), inArray(consents.type, ["terms_privacy", "withdrawal_waiver"])))
    .orderBy(desc(consents.grantedAt));
  // je Art die zuletzt bestätigte Fassung
  const latest = (["terms_privacy", "withdrawal_waiver"] as const).flatMap((type) => {
    const c = given.find((x) => x.type === type);
    if (!c) return [];
    const known = CONSENT_TEXTS[type];
    return [
      {
        text: known.version === c.textVersion ? known.text : `${known.text} (Fassung ${c.textVersion})`,
        version: c.textVersion,
        grantedAt: c.grantedAt,
      },
    ];
  });

  const item = row.snapshot.items[0];
  await sendEmail(
    {
      to: row.user.email,
      userId: row.user.id,
      orderId,
      template: "order-confirmation",
      ...orderConfirmationTemplate({
        name: row.user.name,
        publicRef: row.order.publicRef,
        productName: item?.name ?? "Persönlicher Song mit Video",
        grossCents: row.snapshot.grossCents,
        taxCents: row.snapshot.taxCents,
        taxRateBp: row.snapshot.taxRateBp,
        currency: row.snapshot.currency,
        paidAt: row.order.paidAt,
        orderUrl: `${baseUrl}/bestellung/${row.order.publicRef}`,
        consents: latest,
        isTest: row.order.isTest,
      }),
    },
    db,
  );
  return "Bestellbestätigung verschickt";
}
