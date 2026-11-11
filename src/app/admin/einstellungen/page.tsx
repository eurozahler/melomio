import { Suspense } from "react";
import { getCurrentSongPrice, listAudit, listSettings } from "@/admin/service";
import { getDb } from "@/db/client";
import type { SettingKey } from "@/db/settings";
import { requireAdmin } from "@/server/admin";
import { updatePriceAction, updateSettingAction } from "../actions";
import { SaveField } from "../admin-ui";

/** Verständliche Namen der Einstellungen (Admin ist vorerst nur Deutsch). */
const LABELS: Record<SettingKey, { label: string; hint: string }> = {
  lyrics_ai_revisions_free: { label: "Kostenlose KI-Neuformulierungen", hint: "pro Bestellung (F-18)" },
  music_candidates_before_purchase: {
    label: "Musik-Kandidaten vor dem Kauf",
    hint: "je Kandidat entstehen Anbieterkosten",
  },
  music_extra_candidates_after_purchase: {
    label: "Zweite Song-Version nach dem Kauf (0/1)",
    hint: "Kunde wählt seinen Favoriten · ca. 14 Cent je Kauf",
  },
  version_choice_days: { label: "Auswahl der Version (Tage)", hint: "danach gilt die Hörproben-Version" },
  publication_enabled: { label: "Veröffentlichung anbieten (0/1)", hint: "Zustimmung beim Kauf" },
  publication_discount_pct: {
    label: "Rabatt für Veröffentlichung (%)",
    hint: "Standard, je Anlass unter Fragebögen änderbar",
  },
  affiliate_discount_pct: { label: "Affiliate: Kundenrabatt (%)", hint: "Standard, je Partner änderbar" },
  affiliate_commission_pct: {
    label: "Affiliate: Provision (% vom Netto)",
    hint: "Standard, je Partner änderbar",
  },
  affiliate_hold_days: { label: "Affiliate: Wartezeit bis Auszahlung (Tage)", hint: "wegen Erstattungen" },
  affiliate_min_payout_cents: { label: "Affiliate: Mindestauszahlung (Cent)", hint: "z. B. 2000 = 20 €" },
  music_retries_after_purchase: {
    label: "Neue Musikversuche nach dem Kauf",
    hint: "noch ohne Wirkung (später)",
  },
  song_target_duration_s: { label: "Ziel-Songlänge (Sekunden)", hint: "Prüfung und Musikauftrag" },
  preview_duration_s: { label: "Länge der Hörprobe (Sekunden)", hint: "E12" },
  preview_start_fallback_pct: {
    label: "Ersatz-Startpunkt der Hörprobe (%)",
    hint: "falls der Anbieter keine Abschnitte liefert",
  },
  previews_per_account: { label: "Hörproben pro Konto", hint: "Missbrauchsschutz" },
  previews_daily_budget: { label: "Hörproben pro Tag (alle Kunden)", hint: "Kostenbremse" },
  preview_expiry_days: {
    label: "Hörprobe läuft ab nach (Tagen)",
    hint: "danach werden Audio und Fotos gelöscht",
  },
  download_link_ttl_min: { label: "Gültigkeit der Download-Links (Minuten)", hint: "M9" },
};

export default function AdminSettings() {
  return (
    <Suspense fallback={null}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  await requireAdmin("/admin/einstellungen");
  const db = getDb();
  const [settings, price, log] = await Promise.all([
    listSettings(db),
    getCurrentSongPrice(db),
    listAudit(db),
  ]);
  const date = (d: Date) =>
    d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold tracking-tight">Einstellungen</h1>

      <section>
        <h2 className="mb-2 text-xl font-bold">Preis</h2>
        <SaveField
          label="Song mit Video, Bruttopreis in €"
          hint="Gilt sofort für neue Käufe. Bestehende Bestellungen behalten ihren Preis."
          defaultValue={price ? (price.grossCents / 100).toFixed(2).replace(".", ",") : ""}
          inputMode="decimal"
          testId="admin-price"
          save={updatePriceAction}
        />
      </section>

      <section>
        <h2 className="mb-2 text-xl font-bold">Abläufe und Grenzen</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {settings.map((s) => (
            <SaveField
              key={s.key}
              label={LABELS[s.key].label}
              hint={`${LABELS[s.key].hint} · Standard: ${s.defaultValue}`}
              defaultValue={String(s.value)}
              testId={`setting-${s.key}`}
              save={updateSettingAction.bind(null, s.key)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-bold">Änderungsprotokoll</h2>
        <ol
          className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800"
          data-testid="audit-log"
        >
          {log.map(({ log: l, email }) => (
            <li key={l.id} className="px-3 py-2">
              <span className="text-neutral-500">{date(l.createdAt)}</span> · {email ?? "System"} ·{" "}
              <strong>{l.action}</strong> {l.entityId} · {JSON.stringify(l.oldValue)} →{" "}
              {JSON.stringify(l.newValue)}
            </li>
          ))}
          {log.length === 0 && <li className="px-3 py-2 text-neutral-500">Noch keine Änderungen.</li>}
        </ol>
      </section>
    </div>
  );
}
