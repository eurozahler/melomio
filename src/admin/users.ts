import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { sessions, userRoles, users } from "@/db/schema";
import { audit } from "./service";

/**
 * Benutzerverwaltung im Admin: Konten suchen, Admin-Rollen vergeben/entziehen, Konten sperren,
 * neue Admins einladen. Schutzregeln:
 * - Rollen ändern, Mitarbeiter sperren und einladen darf nur ein Inhaber (owner).
 * - Kunden sperren dürfen Inhaber und Admins.
 * - Niemand kann sich selbst sperren oder sich die Inhaber-Rolle nehmen; der letzte Inhaber bleibt.
 * Jede Änderung landet im Audit-Log.
 */

export const STAFF_ROLES = ["owner", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export class UserAdminError extends Error {
  constructor(
    public readonly code: "not_found" | "forbidden" | "self" | "last_owner" | "invalid" | "inactive",
  ) {
    super(`Benutzerverwaltung abgelehnt: ${code}`);
    this.name = "UserAdminError";
  }
}

export async function rolesOf(db: Database, userId: string): Promise<string[]> {
  const rows = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role);
}

async function requireOwner(db: Database, actorId: string) {
  if (!(await rolesOf(db, actorId)).includes("owner")) throw new UserAdminError("forbidden");
}

async function loadUser(db: Database, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new UserAdminError("not_found");
  return user;
}

export type UserFilter = "all" | "staff" | "blocked";

export async function listUsers(db: Database, opts: { q?: string | null; filter?: UserFilter }, limit = 50) {
  const where = [];
  const q = opts.q?.trim();
  if (q) where.push(or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)));
  if (opts.filter === "blocked") where.push(isNotNull(users.blockedAt));
  if (opts.filter === "staff")
    where.push(
      inArray(
        users.id,
        db
          .select({ id: userRoles.userId })
          .from(userRoles)
          .where(inArray(userRoles.role, [...STAFF_ROLES])),
      ),
    );
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      deletedAt: users.deletedAt,
      blockedAt: users.blockedAt,
      blockedReason: users.blockedReason,
      // Unterabfragen mit vollen Tabellennamen (sonst verwechselt Postgres users.id mit orders.id)
      roles: sql<string[]>`coalesce((select array_agg(ur.role::text order by ur.role) from user_roles ur where ur.user_id = "users"."id"), '{}')`,
      paidOrders: sql<number>`(select count(*)::int from orders o where o.user_id = "users"."id" and o.paid_at is not null)`,
      affiliateStatus: sql<string | null>`(select a.status from affiliates a where a.user_id = "users"."id" limit 1)`,
    })
    .from(users)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(limit);
  const [total] = await db.select({ n: count() }).from(users);
  return { rows, total: total?.n ?? 0 };
}

/** Admin-Rolle vergeben oder entziehen (nur Inhaber). */
export async function setStaffRole(
  db: Database,
  actorId: string,
  userId: string,
  role: StaffRole,
  grant: boolean,
) {
  if (!STAFF_ROLES.includes(role)) throw new UserAdminError("invalid");
  await requireOwner(db, actorId);
  const user = await loadUser(db, userId);
  if (grant && (user.deletedAt || user.blockedAt)) throw new UserAdminError("inactive");
  if (!grant && role === "owner") {
    if (userId === actorId) throw new UserAdminError("self");
    const [owners] = await db.select({ n: count() }).from(userRoles).where(eq(userRoles.role, "owner"));
    if ((owners?.n ?? 0) <= 1) throw new UserAdminError("last_owner");
  }
  await db.transaction(async (tx) => {
    if (grant) await tx.insert(userRoles).values({ userId, role }).onConflictDoNothing();
    else await tx.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)));
    await audit(tx, {
      actorUserId: actorId,
      action: grant ? "role.grant" : "role.revoke",
      entity: "user",
      entityId: userId,
      newValue: role,
    });
  });
}

/** Konto sperren: keine Anmeldung mehr, laufende Sitzungen werden beendet. */
export async function blockUser(db: Database, actorId: string, userId: string, reason: string) {
  if (userId === actorId) throw new UserAdminError("self");
  const user = await loadUser(db, userId);
  const roles = await rolesOf(db, userId);
  if (roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r))) await requireOwner(db, actorId);
  if (roles.includes("owner")) throw new UserAdminError("forbidden");
  if (user.blockedAt) return;
  const text = reason.trim().slice(0, 300) || null;
  await db.transaction(async (tx) => {
    await tx.update(users).set({ blockedAt: new Date(), blockedReason: text }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit(tx, { actorUserId: actorId, action: "user.block", entity: "user", entityId: userId, newValue: text });
  });
}

export async function unblockUser(db: Database, actorId: string, userId: string) {
  const user = await loadUser(db, userId);
  if (!user.blockedAt) return;
  await db.transaction(async (tx) => {
    await tx.update(users).set({ blockedAt: null, blockedReason: null }).where(eq(users.id, userId));
    await audit(tx, {
      actorUserId: actorId,
      action: "user.unblock",
      entity: "user",
      entityId: userId,
      oldValue: user.blockedReason,
    });
  });
}

/** Ist das Konto gesperrt? (Prüfung bei jeder neuen Anmeldung.) */
export async function isBlocked(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), isNotNull(users.blockedAt)));
  return Boolean(row);
}

const emailSchema = z.email().max(254);

/**
 * Neuen Admin einladen (nur Inhaber). Gibt es das Konto noch nicht, wird es angelegt; die Person
 * meldet sich dann per E-Mail-Link an (damit gilt die Adresse als bestätigt) und kann später unter
 * „Passwort vergessen“ ein Passwort setzen.
 */
export async function inviteStaff(db: Database, actorId: string, rawEmail: string, role: StaffRole) {
  if (!STAFF_ROLES.includes(role)) throw new UserAdminError("invalid");
  const parsed = emailSchema.safeParse(rawEmail.trim().toLowerCase());
  if (!parsed.success) throw new UserAdminError("invalid");
  const email = parsed.data;
  await requireOwner(db, actorId);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.email, email));
    if (existing && (existing.deletedAt || existing.blockedAt)) throw new UserAdminError("inactive");
    let userId = existing?.id;
    if (!userId) {
      userId = randomUUID();
      await tx.insert(users).values({ id: userId, email, name: "" });
    }
    await tx.insert(userRoles).values({ userId, role }).onConflictDoNothing();
    await audit(tx, {
      actorUserId: actorId,
      action: "user.invite",
      entity: "user",
      entityId: userId,
      newValue: { role, created: !existing },
    });
    return { userId, email, created: !existing };
  });
}

