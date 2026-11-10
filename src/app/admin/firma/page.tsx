import { Suspense } from "react";
import { getDb } from "@/db/client";
import { getCompanyProfile } from "@/invoices/company";
import { requireAdmin } from "@/server/admin";
import { saveCompanyAction } from "../actions";
import { CompanyForm } from "./company-form";

export default function AdminCompany() {
  return (
    <Suspense fallback={null}>
      <Company />
    </Suspense>
  );
}

async function Company() {
  await requireAdmin("/admin/firma");
  const { profile, complete } = await getCompanyProfile(getDb());
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Firma</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Diese Angaben stehen auf jeder Rechnung. Änderungen gelten nur für neue Rechnungen – bereits
          ausgestellte bleiben unverändert.
        </p>
      </div>
      <p
        data-testid="company-status"
        className={`rounded-xl p-3 text-sm ${complete ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}
      >
        {complete
          ? "✓ Vollständig – Rechnungen werden mit diesen Angaben ausgestellt."
          : "Noch unvollständig. Im Testbetrieb entstehen Testrechnungen mit Platzhaltern; im Livebetrieb ist ein Kauf erst mit vollständigen Firmendaten möglich."}
      </p>
      <CompanyForm initial={profile} save={saveCompanyAction} />
    </div>
  );
}
