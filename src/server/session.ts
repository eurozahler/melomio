import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";

export type SessionUser = { id: string; email: string; name: string; emailVerified: boolean };

/** Angemeldeter Benutzer oder null. Nur auf dem Server verwenden. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, email, name, emailVerified } = session.user;
  return { id, email, name, emailVerified };
}

/** Nur relative Pfade innerhalb der eigenen Seite zulassen (Schutz vor Weiterleitung auf fremde Seiten). */
export function safeNextPath(value: string | string[] | undefined | null, fallback = "/konto"): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  return v;
}

/** Verlangt eine Anmeldung mit bestätigter E-Mail. Sonst Weiterleitung zur Anmeldung. */
export async function requireUser(nextPath: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || !user.emailVerified) redirect(`/anmelden?next=${encodeURIComponent(nextPath)}`);
  return user;
}
