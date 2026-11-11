import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { consents, orders, priceSnapshots, users } from "@/db/schema";
import { CONSENT_TEXTS, type CheckoutConsentType } from "@/domain/consents";

const CONSENT_TYPES = Object.keys(CONSENT_TEXTS) as CheckoutConsentType[];
import { readInvoicePdf, type Invoice } from "@/invoices/service";
import { sendEmail } from "@/server/email";
import type { StorageProvider } from "@/storage";
import {
  orderConfirmationTemplate,
  songReadyTemplate,
  versionChoiceTemplate,
} from "@/server/email/templates";
import { getSetting } from "@/db/settings-store";

/**
 * Nach bestätigter Zahlung (M7): Bestellbestätigung per E-Mail mit Vertragsinhalt und den
 * bestätigten Einwilligungen (E16). In M8 kommt hier das Video dazu.
 */
export async function sendOrderConfirmation(
  db: Database,
  baseUrl: string,
  orderId: string,
  invoice?: { invoice: Invoice; storage: StorageProvider } | null,
): Promise<string> {
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
    .where(and(eq(consents.orderId, orderId), inArray(consents.type, CONSENT_TYPES)))
    .orderBy(desc(consents.grantedAt));
  // je Art die zuletzt bestätigte Fassung
  const latest = CONSENT_TYPES.flatMap((type) => {
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
  const attachments = invoice
    ? [
        {
          filename: `Rechnung-${invoice.invoice.number}.pdf`,
          content: await readInvoicePdf(invoice.storage, invoice.invoice),
          contentType: "application/pdf",
        },
      ]
    : undefined;
  await sendEmail(
    {
      to: row.user.email,
      userId: row.user.id,
      orderId,
      template: "order-confirmation",
      attachments,
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
        invoiceNumber: invoice?.invoice.number ?? null,
      }),
    },
    db,
  );
  return invoice
    ? `Bestellbestätigung mit Rechnung ${invoice.invoice.number} verschickt`
    : "Bestellbestätigung verschickt";
}

/** E-Mail „Dein Song ist fertig“ – nach Abschluss des Videos (M9). */
export async function sendSongReady(db: Database, baseUrl: string, orderId: string): Promise<string> {
  const [row] = await db
    .select({ order: orders, user: users })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.id, orderId));
  if (!row) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  if (row.order.status !== "completed") return "übersprungen (noch nicht fertig)";
  await sendEmail(
    {
      to: row.user.email,
      userId: row.user.id,
      orderId,
      template: "song-ready",
      ...songReadyTemplate({
        name: row.user.name,
        publicRef: row.order.publicRef,
        orderUrl: `${baseUrl}/bestellung/${row.order.publicRef}`,
        isTest: row.order.isTest,
      }),
    },
    db,
  );
  return "E-Mail „Song fertig“ verschickt";
}

/** E-Mail „Wähle deine Version“ (zweite Song-Version nach dem Kauf). */
export async function sendVersionChoice(db: Database, baseUrl: string, orderId: string): Promise<string> {
  const [row] = await db
    .select({ order: orders, user: users })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.id, orderId));
  if (!row) throw new Error(`Bestellung ${orderId} nicht gefunden`);
  if (row.order.status !== "awaiting_choice") return "übersprungen (keine Auswahl offen)";
  await sendEmail(
    {
      to: row.user.email,
      userId: row.user.id,
      orderId,
      template: "version-choice",
      ...versionChoiceTemplate({
        name: row.user.name,
        publicRef: row.order.publicRef,
        orderUrl: `${baseUrl}/bestellung/${row.order.publicRef}`,
        days: await getSetting(db, "version_choice_days"),
        isTest: row.order.isTest,
      }),
    },
    db,
  );
  return "E-Mail „Version wählen“ verschickt";
}
