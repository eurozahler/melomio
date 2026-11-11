"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const COUNTED = /^\/($|lieder\/[a-z0-9-]+$|song\/[a-z0-9-]+$)/;

/**
 * Meldet Aufrufe von Startseite, Landingpages und Fragebogen-Start an /api/besuch –
 * ohne Cookie und ohne Kennung (nur für Tagessummen je Herkunft).
 */
export function VisitBeacon() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!COUNTED.test(pathname)) return;
    const body = JSON.stringify({
      path: pathname,
      search: searchParams.toString().slice(0, 1500),
      referrer: document.referrer ? document.referrer.slice(0, 500) : null,
    });
    try {
      fetch("/api/besuch", {
        method: "POST",
        body,
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }).catch(() => {});
    } catch {
      // Zählen ist nie wichtiger als die Seite
    }
  }, [pathname, searchParams]);
  return null;
}
