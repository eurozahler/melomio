import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { devMockPayments } from "@/db/schema";
import { processPaymentUpdate } from "@/orders/checkout";
import { setMockPaymentStatus } from "@/payments/mock";
import { getSenderBoss } from "@/server/jobs";
import { getAppPaymentProvider } from "@/server/payments";

/**
 * Test-Bezahlseite (nur Testbetrieb mit PAYMENT_PROVIDER=mock) – spielt die Bezahlseite von Mollie.
 * Nach dem Klick wird wie bei Mollie ein Webhook simuliert; der Server fragt den Status selbst ab.
 */
export default function MockPaymentPage({ params }: PageProps<"/dev/zahlung/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-10">
      <Suspense fallback={null}>
        <MockPayment params={params} />
      </Suspense>
    </main>
  );
}

function mockEnabled() {
  const env = getEnv();
  return env.isTestOperation && env.PAYMENT_PROVIDER === "mock";
}

async function decide(id: string, status: "paid" | "failed" | "canceled") {
  "use server";
  if (!mockEnabled()) notFound();
  const db = getDb();
  const row = await setMockPaymentStatus(db, id, status);
  if (!row) notFound();
  // Simulierter Webhook – der Status wird dabei erneut „beim Anbieter“ abgefragt
  await processPaymentUpdate(db, await getSenderBoss(), getAppPaymentProvider(), id, "webhook");
  redirect(row.redirectUrl);
}

async function MockPayment({ params }: Pick<PageProps<"/dev/zahlung/[id]">, "params">) {
  await connection();
  if (!mockEnabled()) notFound();
  const { id } = await params;
  const [payment] = await getDb().select().from(devMockPayments).where(eq(devMockPayments.id, id));
  if (!payment) notFound();
  const amount = new Intl.NumberFormat("de-DE", { style: "currency", currency: payment.currency }).format(
    payment.amountCents / 100,
  );
  const button = "w-full rounded-full px-6 py-3 font-semibold";

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Test-Bezahlseite</strong> – hier wird kein Geld bewegt. Im Livebetrieb erscheint an dieser
        Stelle die Bezahlseite von Mollie.
      </div>
      <h1 className="text-2xl font-bold">{payment.description}</h1>
      <p className="text-4xl font-bold" data-testid="mock-amount">
        {amount}
      </p>
      {payment.status === "open" ? (
        <div className="flex flex-col gap-3">
          <form action={decide.bind(null, id, "paid")}>
            <button className={`${button} bg-green-600 text-white`}>Zahlung erfolgreich</button>
          </form>
          <form action={decide.bind(null, id, "failed")}>
            <button className={`${button} bg-red-600 text-white`}>Zahlung fehlgeschlagen</button>
          </form>
          <form action={decide.bind(null, id, "canceled")}>
            <button className={`${button} border border-neutral-300`}>Abbrechen</button>
          </form>
        </div>
      ) : (
        <p>Diese Test-Zahlung ist bereits abgeschlossen ({payment.status}).</p>
      )}
    </div>
  );
}
