"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Lädt die Seitendaten alle paar Sekunden neu, solange `active` gilt (z. B. Bestellung in Arbeit). */
export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, router]);
  return null;
}
