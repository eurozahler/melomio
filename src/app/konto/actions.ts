"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth";
import { AccountActionError, deleteAccount } from "@/account/service";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { DRAFT_COOKIE } from "@/server/drafts";
import { getSessionUser } from "@/server/session";
import { getStorage } from "@/storage";

/**
 * Abmelden: Sitzung beenden und das Entwurfs-Cookie entfernen, damit an einem gemeinsam
 * genutzten Gerät niemand den Entwurf der vorherigen Person sieht.
 */
export async function logoutAction() {
  await getAuth().api.signOut({ headers: await headers() });
  (await cookies()).delete(DRAFT_COOKIE);
  redirect("/");
}

/** Konto löschen (DSGVO Art. 17). Gibt bei Erfolg nichts zurück, sondern leitet weiter. */
export async function deleteAccountAction(): Promise<{ error: string } | void> {
  const user = await getSessionUser();
  if (!user) redirect("/anmelden");
  try {
    await deleteAccount(getDb(), getStorage(getEnv()), user.id);
  } catch (error) {
    if (error instanceof AccountActionError && error.code === "busy") {
      return { error: "busy" };
    }
    console.error("[Konto löschen]", error);
    return { error: "failed" };
  }
  // Die Sitzung ist bereits gelöscht – das Cookie trotzdem sauber entfernen
  await getAuth()
    .api.signOut({ headers: await headers() })
    .catch(() => undefined);
  (await cookies()).delete(DRAFT_COOKIE);
  redirect("/konto-geloescht");
}
