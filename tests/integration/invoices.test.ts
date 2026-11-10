import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { seed } from "@/db/seed";
import { appSettings, devMailbox, invoices, orders, users } from "@/db/schema";
import { CompanyProfileError, COMPANY_KEY, saveCompanyProfile } from "@/invoices/company";
import { cancelInvoice, createInvoiceForOrder, readInvoicePdf } from "@/invoices/service";
import { createBoss } from "@/jobs/boss";
import { handleOrderPaid } from "@/jobs/handlers";
import { CheckoutError, processPaymentUpdate, startCheckout } from "@/orders/checkout";
import { transitionOrder } from "@/orders/service";
import { createMockPaymentProvider, setMockPaymentStatus } from "@/payments/mock";
import {
  connectTestDb,
  createUserWithOrder,
  orderWithRealPreview,
  testDeps,
  useShortSongs as shortSongs,
} from "./helpers";

const { db, pool } = connectTestDb();
let boss: PgBoss;
const BASE = "http://localhost:3200";
const provider = () => createMockPaymentProvider(db, BASE);

const COMPANY = {
  name: "Beispiel UG (haftungsbeschränkt)",
  street: "Hauptstraße 5",
  postalCode: "80331",
  city: "München",
  country: "Deutschland",
  managingDirector: "Erika Muster",
  registerCourt: "Amtsgericht München",
  registerNumber: "HRB 123456",
  vatId: "DE123456789",
  taxNumber: "",
  email: "hallo@melomio.de",
  phone: "",
  website: "melomio.de",
};

beforeAll(async () => {
  await seed(db);
  boss = createBoss(process.env.DATABASE_URL_TEST!, "sender");
  await boss.start();
});

afterEach(async () => {
  await db.delete(appSettings).where(eq(appSettings.key, COMPANY_KEY));
});

afterAll(async () => {
  await boss.stop({ graceful: false });
  await pool.end();
});

/** Bezahlte Testbestellung (Test-Zahlung, ohne Musik). */
async function paidOrder(withMusic = false) {
  let userId: string, order: Awaited<ReturnType<typeof createUserWithOrder>>["order"];
  if (withMusic) {
    await shortSongs(db);
    ({ userId, order } = await orderWithRealPreview(db, boss));
  } else {
    ({ userId, order } = await createUserWithOrder(db));
    for (const to of [
      "lyrics_generating",
      "lyrics_review",
      "lyrics_approved",
      "music_generating",
      "preview_ready",
    ] as const) {
      await transitionOrder(db, order.id, to, { actor: "test" });
    }
  }
  const url = await startCheckout(db, provider(), {
    publicRef: order.publicRef,
    userId,
    accepted: { termsPrivacy: true, withdrawalWaiver: true },
    ipHash: "hash",
    baseUrl: BASE,
    webhookUrl: null,
  });
  const id = url.split("/dev/zahlung/")[1]!;
  await setMockPaymentStatus(db, id, "paid");
  await processPaymentUpdate(db, boss, provider(), id, "webhook");
  return { userId, order };
}

const storage = () => testDeps(db, boss).storage;
const year = Number(
  new Intl.DateTimeFormat("de-DE", { year: "numeric", timeZone: "Europe/Berlin" }).format(new Date()),
);

describe("Rechnungen", () => {
  it("stellt nach der Zahlung genau eine Testrechnung aus (eigener Nummernkreis, PDF gespeichert)", async () => {
    const { order } = await paidOrder();
    const first = await createInvoiceForOrder(db, storage(), order.id);
    const again = await createInvoiceForOrder(db, storage(), order.id);
    expect(again.id).toBe(first.id);
    expect(first.number).toMatch(new RegExp(`^TEST-RE-${year}-\\d{5}$`));
    expect(first).toMatchObject({
      kind: "invoice",
      isTest: true,
      grossCents: 999,
      taxCents: 160,
      netCents: 839,
    });
    expect(first.seller.name).toMatch(/Firmendaten fehlen/);
    const pdf = await readInvoicePdf(storage(), first);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("vergibt fortlaufende Nummern ohne Lücken", async () => {
    const a = await createInvoiceForOrder(db, storage(), (await paidOrder()).order.id);
    const b = await createInvoiceForOrder(db, storage(), (await paidOrder()).order.id);
    const n = (s: string) => Number(s.slice(-5));
    expect(n(b.number)).toBe(n(a.number) + 1);
  });

  it("verweigert die Rechnung für eine unbezahlte Bestellung", async () => {
    const { order } = await createUserWithOrder(db);
    await expect(createInvoiceForOrder(db, storage(), order.id)).rejects.toThrow(/nicht bezahlt/);
  });

  it("Livebestellung: ohne Firmendaten keine Rechnung, mit Firmendaten RE-Nummer und Firmenkopf", async () => {
    const { order } = await paidOrder();
    await db.update(orders).set({ isTest: false }).where(eq(orders.id, order.id));
    await expect(createInvoiceForOrder(db, storage(), order.id)).rejects.toBeInstanceOf(CompanyProfileError);

    await saveCompanyProfile(db, COMPANY, (await db.select().from(users).limit(1))[0]!.id);
    const invoice = await createInvoiceForOrder(db, storage(), order.id);
    expect(invoice.number).toMatch(new RegExp(`^RE-${year}-\\d{5}$`));
    expect(invoice.seller).toMatchObject({
      name: COMPANY.name,
      vatId: "DE123456789",
      register: "Amtsgericht München, HRB 123456",
    });
  });

  it("Firmendaten werden geprüft (USt-IdNr. oder Steuernummer Pflicht)", async () => {
    const actor = (await db.select().from(users).limit(1))[0]!.id;
    await expect(saveCompanyProfile(db, { ...COMPANY, vatId: "" }, actor)).rejects.toThrow(
      /USt-IdNr. oder Steuernummer/,
    );
    await expect(saveCompanyProfile(db, { ...COMPANY, vatId: "123" }, actor)).rejects.toThrow(
      /DE \+ 9 Ziffern/,
    );
    await expect(
      saveCompanyProfile(db, { ...COMPANY, vatId: "", taxNumber: "143/123/45678" }, actor),
    ).resolves.toBeTruthy();
  });

  it("Storno: negative Beträge, Verweis auf die Rechnung, nur einmal möglich", async () => {
    const { userId, order } = await paidOrder();
    const invoice = await createInvoiceForOrder(db, storage(), order.id);
    const storno = await cancelInvoice(db, storage(), invoice.id, userId, "Erstattung");
    expect(storno).toMatchObject({
      kind: "cancellation",
      cancelsInvoiceId: invoice.id,
      grossCents: -999,
      taxCents: -160,
    });
    expect(storno.number).toMatch(new RegExp(`^TEST-ST-${year}-\\d{5}$`));
    await expect(cancelInvoice(db, storage(), invoice.id, userId, null)).rejects.toMatchObject({
      code: "already_cancelled",
    });
    await expect(cancelInvoice(db, storage(), storno.id, userId, null)).rejects.toMatchObject({
      code: "not_cancellable",
    });
  });

  it("die Bestellbestätigung enthält die Rechnung als Anhang", async () => {
    const { userId, order } = await paidOrder(true);
    await handleOrderPaid(testDeps(db, boss), { orderId: order.id });
    const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, order.id));
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const [mail] = await db
      .select()
      .from(devMailbox)
      .where(and(eq(devMailbox.recipient, user!.email), eq(devMailbox.template, "order-confirmation")));
    expect(mail!.text).toContain(`Deine Rechnung ${invoice!.number} findest du im Anhang`);
    expect(mail!.text).toContain(`[Anhang: Rechnung-${invoice!.number}.pdf]`);
  });

  it("Livebetrieb: ohne vollständige Firmendaten ist kein Kauf möglich", async () => {
    const { userId, order } = await createUserWithOrder(db);
    await db.update(orders).set({ isTest: false }).where(eq(orders.id, order.id));
    for (const to of [
      "lyrics_generating",
      "lyrics_review",
      "lyrics_approved",
      "music_generating",
      "preview_ready",
    ] as const) {
      await transitionOrder(db, order.id, to, { actor: "test" });
    }
    const attempt = startCheckout(db, provider(), {
      publicRef: order.publicRef,
      userId,
      accepted: { termsPrivacy: true, withdrawalWaiver: true },
      ipHash: "hash",
      baseUrl: BASE,
      webhookUrl: null,
    });
    await expect(attempt).rejects.toBeInstanceOf(CheckoutError);
    await expect(attempt).rejects.toMatchObject({ code: "seller_incomplete" });
  });
});

describe("Firmenrechnung", () => {
  it("die Rechnungsanschrift aus dem Kauf steht auf der Rechnung", async () => {
    const { userId, order } = await createUserWithOrder(db);
    for (const to of [
      "lyrics_generating",
      "lyrics_review",
      "lyrics_approved",
      "music_generating",
      "preview_ready",
    ] as const) {
      await transitionOrder(db, order.id, to, { actor: "test" });
    }
    const billing = {
      company: "Musterfirma GmbH",
      contact: "Erika Muster",
      street: "Hauptstraße 5",
      postalCode: "80331",
      city: "München",
      country: "Deutschland",
      vatId: "DE123456789",
    };
    const url = await startCheckout(db, provider(), {
      publicRef: order.publicRef,
      userId,
      accepted: { termsPrivacy: true, withdrawalWaiver: true },
      ipHash: "hash",
      baseUrl: BASE,
      webhookUrl: null,
      billing,
    });
    const id = url.split("/dev/zahlung/")[1]!;
    await setMockPaymentStatus(db, id, "paid");
    await processPaymentUpdate(db, boss, provider(), id, "webhook");
    const invoice = await createInvoiceForOrder(db, storage(), order.id);
    expect(invoice.buyer.name).toBe("Musterfirma GmbH");
    expect(invoice.buyer.lines).toEqual([
      "z. Hd. Erika Muster",
      "Hauptstraße 5",
      "80331 München",
      "USt-IdNr.: DE123456789",
    ]);
  });

  it("eine unvollständige Rechnungsanschrift wird abgelehnt", async () => {
    const { userId, order } = await createUserWithOrder(db);
    for (const to of [
      "lyrics_generating",
      "lyrics_review",
      "lyrics_approved",
      "music_generating",
      "preview_ready",
    ] as const) {
      await transitionOrder(db, order.id, to, { actor: "test" });
    }
    await expect(
      startCheckout(db, provider(), {
        publicRef: order.publicRef,
        userId,
        accepted: { termsPrivacy: true, withdrawalWaiver: true },
        ipHash: "hash",
        baseUrl: BASE,
        webhookUrl: null,
        billing: { company: "X" },
      }),
    ).rejects.toMatchObject({ code: "billing_invalid" });
  });
});
