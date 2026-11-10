import { Suspense } from "react";
import { getDb } from "@/db/client";
import { listVouchers } from "@/orders/vouchers";
import { requireAdmin } from "@/server/admin";
import { createVoucherAction, setVoucherActiveAction } from "../actions";
import { ActionButton } from "../admin-ui";
import { VoucherForm } from "./voucher-form";

export default function AdminVouchers() {
  return (
    <Suspense fallback={null}>
      <Vouchers />
    </Suspense>
  );
}

async function Vouchers() {
  await requireAdmin("/admin/gutscheine");
  const rows = await listVouchers(getDb());
  const euro = (c: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100);
  const day = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gutscheine</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Kunden geben den Code beim Kauf ein. 100 % = Gratis-Song ohne Bezahlseite (z. B. für Gewinnspiele).
        </p>
      </div>
      <VoucherForm create={createVoucherAction} />
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Noch keine Gutscheine.</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="voucher-list">
          {rows.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800"
            >
              <span>
                <strong className="font-mono">{v.code}</strong> ·{" "}
                {v.kind === "percent" ? `${v.value} %` : euro(v.value)} · {v.redeemed}
                {v.maxRedemptions ? ` von ${v.maxRedemptions}` : ""} eingelöst
                {v.validUntil && ` · bis ${day(v.validUntil)}`}
                {v.note && <span className="text-neutral-500"> · {v.note}</span>}
                {!v.active && (
                  <span className="ml-2 rounded bg-neutral-200 px-1.5 text-xs text-neutral-700">inaktiv</span>
                )}
              </span>
              <ActionButton
                label={v.active ? "Deaktivieren" : "Aktivieren"}
                variant="secondary"
                action={setVoucherActiveAction.bind(null, v.id, !v.active)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
