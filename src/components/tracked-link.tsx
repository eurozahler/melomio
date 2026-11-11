"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { withForwardedParams } from "@/domain/attribution";

/**
 * Interner Link, der Werbe-Parameter (utm_*, gclid) und die fremde Herkunftsseite weiterreicht –
 * so bleibt die Herkunft bis zur Bestellung erhalten, ganz ohne Cookies.
 */
export function TrackedLink({
  href,
  extra,
  className,
  children,
  testId,
}: {
  href: string;
  extra?: Record<string, string | undefined>;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Ohne Herkunftsseite (die kennt nur der Browser) – beim Klick wird sie ergänzt
  const base = withForwardedParams(href, searchParams, null, "", extra);
  return (
    <Link
      href={base}
      className={className}
      data-testid={testId}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const full = withForwardedParams(href, searchParams, document.referrer, window.location.hostname, extra);
        if (full === base) return;
        e.preventDefault();
        router.push(full);
      }}
    >
      {children}
    </Link>
  );
}
