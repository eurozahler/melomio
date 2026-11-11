"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Cookie-Banner und Google-Ads-Code (Google-Tag).
 * Der Google-Code wird NUR nach „Akzeptieren“ geladen. Die Wahl liegt in einem technisch notwendigen
 * Cookie (12 Monate) und lässt sich über „Cookie-Einstellungen“ in der Fußzeile ändern.
 */

export const CONSENT_COOKIE = "melomio_consent";
const OPEN_EVENT = "melomio:consent-open";

type Choice = "ja" | "nein" | null;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function readConsent(): Choice {
  const m = /(?:^|;\s*)melomio_consent=(ja|nein)/.exec(document.cookie);
  return (m?.[1] as Choice) ?? null;
}

function writeConsent(choice: "ja" | "nein") {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${secure}`;
}

/** Google-Tag laden (einmalig). Aufrufe vor dem Laden landen in der Warteschlange (dataLayer). */
export function ensureGtag(adsId: string) {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params -- Google erwartet das arguments-Objekt
    window.dataLayer!.push(arguments);
  };
  window.gtag("consent", "default", {
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", adsId, { allow_ad_personalization_signals: false });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`;
  document.head.appendChild(script);
}

/** Google-Cookies entfernen, wenn die Einwilligung widerrufen wird. */
function removeGoogleCookies() {
  const host = window.location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const name of document.cookie.split(";").map((c) => c.split("=")[0]!.trim())) {
    if (!/^(_gcl_|_ga|_gid|FPAU|FPGCL)/.test(name)) continue;
    for (const d of domains)
      document.cookie = `${name}=; Max-Age=0; Path=/${d ? `; Domain=${d}` : ""}`;
  }
}

export function ConsentManager({ adsId }: { adsId: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.consent = "on";
    const choice = readConsent();
    if (choice === "ja") ensureGtag(adsId);
    // Banner erst nach dem Laden zeigen (kein Flackern beim Server-Rendern)
    const t = setTimeout(() => setOpen(choice === null), 0);
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      clearTimeout(t);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [adsId]);

  if (!open) return null;
  const decide = (choice: "ja" | "nein") => {
    const before = readConsent();
    writeConsent(choice);
    setOpen(false);
    if (choice === "ja") ensureGtag(adsId);
    else if (before === "ja") {
      removeGoogleCookies();
      window.location.reload();
    }
  };
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      data-testid="consent-banner"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 px-4 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1 text-sm">
          <p id="consent-title" className="font-semibold">
            Dürfen wir messen, ob unsere Werbung wirkt?
          </p>
          <p className="mt-1 text-neutral-600 dark:text-neutral-300">
            Mit deiner Zustimmung setzen wir Google Ads ein, um zu sehen, welche Anzeigen zu einem Kauf führen.
            Dabei werden Cookies gesetzt und Daten an Google (auch in die USA) übermittelt. Ohne Zustimmung
            funktioniert alles genauso. Mehr in der{" "}
            <Link href="/datenschutz#cookies" className="underline">
              Datenschutzerklärung
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide("nein")}
            className="flex-1 rounded-full border border-neutral-300 px-5 py-2 text-sm font-semibold dark:border-neutral-700"
          >
            Ablehnen
          </button>
          <button
            type="button"
            onClick={() => decide("ja")}
            className="flex-1 rounded-full border border-neutral-300 px-5 py-2 text-sm font-semibold dark:border-neutral-700"
          >
            Akzeptieren
          </button>
        </div>
      </div>
    </div>
  );
}

/** Link in der Fußzeile: öffnet das Banner erneut (nur sichtbar, wenn Google Ads aktiv ist). */
export function ConsentSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={`consent-settings ${className ?? ""}`}
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
    >
      Cookie-Einstellungen
    </button>
  );
}

/** Meldet einen Kauf an Google Ads – nur mit Einwilligung, je Bestellung nur einmal. */
export function PurchaseConversion(p: {
  adsId: string;
  label: string;
  transactionId: string;
  valueCents: number;
  currency: string;
}) {
  useEffect(() => {
    if (readConsent() !== "ja") return;
    const key = `melomio-conv-${p.transactionId}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      // ohne Speicher verhindert Google Doppelzählungen über transaction_id
    }
    ensureGtag(p.adsId);
    window.gtag!("event", "conversion", {
      send_to: `${p.adsId}/${p.label}`,
      value: p.valueCents / 100,
      currency: p.currency,
      transaction_id: p.transactionId,
    });
  }, [p.adsId, p.label, p.transactionId, p.valueCents, p.currency]);
  return null;
}
