import "server-only";
import { notFound } from "next/navigation";
import { isAdmin } from "@/admin/service";
import { getDb } from "@/db/client";
import { getSessionUser, requireUser, type SessionUser } from "./session";

/**
 * Admin-Zugang: Anmeldung UND Rolle Owner/Admin. Für alle anderen gibt es den Admin-Bereich
 * nicht (404) – so verrät die Seite nicht einmal, dass es ihn gibt.
 */
export async function requireAdmin(nextPath: string): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  if (!(await isAdmin(getDb(), user.id))) notFound();
  return user;
}

/** Für Server-Aktionen und Routen: Admin oder null (keine Weiterleitung). */
export async function getAdminUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user?.emailVerified) return null;
  return (await isAdmin(getDb(), user.id)) ? user : null;
}
