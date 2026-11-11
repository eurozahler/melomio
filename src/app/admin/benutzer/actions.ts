"use server";

import { refresh } from "next/cache";
import {
  blockUser,
  inviteStaff,
  setStaffRole,
  STAFF_ROLES,
  type StaffRole,
  unblockUser,
  UserAdminError,
} from "@/admin/users";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { getAdminUser } from "@/server/admin";
import { sendEmail } from "@/server/email";
import { staffInviteTemplate } from "@/server/email/templates";
import type { AdminResult } from "../actions";

/** Server-Aktionen der Benutzerverwaltung. Die Schutzregeln stehen in src/admin/users.ts. */

async function run(fn: (actorId: string) => Promise<string>): Promise<AdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  try {
    const message = await fn(admin.id);
    refresh();
    return { ok: true, message };
  } catch (error) {
    if (error instanceof UserAdminError) {
      const text = {
        not_found: "Konto nicht gefunden.",
        forbidden: "Das darf nur ein Inhaber (und Inhaber können nicht gesperrt werden).",
        self: "Das geht nicht bei deinem eigenen Konto.",
        last_owner: "Es muss mindestens ein Inhaber bleiben.",
        invalid: "Ungültige Eingabe.",
        inactive: "Das Konto ist gesperrt oder gelöscht.",
      }[error.code];
      return { ok: false, error: text };
    }
    console.error("[Admin Benutzer]", error);
    return { ok: false, error: "Das hat nicht geklappt." };
  }
}

const isRole = (r: unknown): r is StaffRole => (STAFF_ROLES as readonly unknown[]).includes(r);
const roleName = (r: StaffRole) => (r === "owner" ? "Inhaber" : "Admin");

export async function setRoleAction(userId: unknown, role: unknown, grant: unknown) {
  return run(async (actorId) => {
    if (typeof userId !== "string" || !isRole(role) || typeof grant !== "boolean")
      throw new UserAdminError("invalid");
    await setStaffRole(getDb(), actorId, userId, role, grant);
    return grant ? `Rolle „${roleName(role)}“ vergeben.` : `Rolle „${roleName(role)}“ entzogen.`;
  });
}

export async function blockUserAction(userId: unknown, reason: string | null) {
  return run(async (actorId) => {
    if (typeof userId !== "string") throw new UserAdminError("invalid");
    await blockUser(getDb(), actorId, userId, typeof reason === "string" ? reason : "");
    return "Gesperrt – das Konto wurde abgemeldet.";
  });
}

export async function unblockUserAction(userId: unknown) {
  return run(async (actorId) => {
    if (typeof userId !== "string") throw new UserAdminError("invalid");
    await unblockUser(getDb(), actorId, userId);
    return "Entsperrt.";
  });
}

export async function inviteStaffAction(email: unknown, role: unknown) {
  return run(async (actorId) => {
    if (typeof email !== "string" || !isRole(role)) throw new UserAdminError("invalid");
    const db = getDb();
    const result = await inviteStaff(db, actorId, email, role);
    const env = getEnv();
    await sendEmail(
      {
        to: result.email,
        userId: result.userId,
        template: "staff-invite",
        ...staffInviteTemplate({
          role,
          loginUrl: `${env.APP_BASE_URL}/anmelden?next=${encodeURIComponent("/admin")}`,
          isTest: env.isTestOperation,
        }),
      },
      db,
    );
    return result.created
      ? `Einladung an ${result.email} verschickt.`
      : `${result.email} hatte schon ein Konto – Rolle vergeben und Einladung verschickt.`;
  });
}
