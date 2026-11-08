"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth";
import { DRAFT_COOKIE } from "@/server/drafts";

/**
 * Abmelden: Sitzung beenden und das Entwurfs-Cookie entfernen, damit an einem gemeinsam
 * genutzten Gerät niemand den Entwurf der vorherigen Person sieht.
 */
export async function logoutAction() {
  await getAuth().api.signOut({ headers: await headers() });
  (await cookies()).delete(DRAFT_COOKIE);
  redirect("/");
}
