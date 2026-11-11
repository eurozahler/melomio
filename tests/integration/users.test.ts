// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { isAdmin } from "@/admin/service";
import {
  blockUser,
  inviteStaff,
  isBlocked,
  listUsers,
  rolesOf,
  setStaffRole,
  unblockUser,
  UserAdminError,
} from "@/admin/users";
import { sessions, userRoles, users } from "@/db/schema";
import { connectTestDb } from "./helpers";

const { db, pool } = connectTestDb();

async function makeUser(roles: ("owner" | "admin")[] = []) {
  const id = randomUUID();
  await db.insert(users).values({ id, email: `u-${id}@example.invalid`, emailVerified: true });
  for (const role of roles) await db.insert(userRoles).values({ userId: id, role });
  return id;
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof UserAdminError) return e.code;
    throw e;
  }
};

let owner: string;
let admin: string;
let customer: string;

beforeAll(async () => {
  owner = await makeUser(["owner"]);
  admin = await makeUser(["admin"]);
  customer = await makeUser();
});

afterAll(async () => {
  await pool.end();
});

describe("Benutzerverwaltung", () => {
  it("nur Inhaber vergeben und entziehen Rollen", async () => {
    expect(await code(setStaffRole(db, admin, customer, "admin", true))).toBe("forbidden");
    expect(await code(setStaffRole(db, owner, customer, "admin", true))).toBe("ok");
    expect(await rolesOf(db, customer)).toContain("admin");
    expect(await isAdmin(db, customer)).toBe(true);
    expect(await code(setStaffRole(db, owner, customer, "admin", false))).toBe("ok");
    expect(await isAdmin(db, customer)).toBe(false);
  });

  it("Inhaber kann sich die Inhaber-Rolle nicht selbst nehmen", async () => {
    expect(await code(setStaffRole(db, owner, owner, "owner", false))).toBe("self");
  });

  it("Sperren beendet Sitzungen, nimmt Admin-Zugang und lässt sich aufheben", async () => {
    const target = await makeUser(["admin"]);
    await db.insert(sessions).values({
      id: randomUUID(),
      token: randomUUID(),
      userId: target,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    // Admins dürfen keine Mitarbeiter sperren, niemand sich selbst oder einen Inhaber
    expect(await code(blockUser(db, admin, target, ""))).toBe("forbidden");
    expect(await code(blockUser(db, owner, owner, ""))).toBe("self");
    expect(await code(blockUser(db, owner, await makeUser(["owner"]), ""))).toBe("forbidden");

    expect(await code(blockUser(db, owner, target, "Missbrauch"))).toBe("ok");
    expect(await isBlocked(db, target)).toBe(true);
    expect(await isAdmin(db, target)).toBe(false);
    expect(await db.select().from(sessions).where(eq(sessions.userId, target))).toHaveLength(0);
    expect(await code(setStaffRole(db, owner, target, "owner", true))).toBe("inactive");

    await unblockUser(db, owner, target);
    expect(await isBlocked(db, target)).toBe(false);
    expect(await isAdmin(db, target)).toBe(true);
  });

  it("Admins dürfen Kunden sperren", async () => {
    const c = await makeUser();
    expect(await code(blockUser(db, admin, c, ""))).toBe("ok");
    const { rows } = await listUsers(db, { q: c, filter: "blocked" });
    // Suche läuft über E-Mail und Name – die E-Mail enthält die ID
    expect(rows.map((r) => r.id)).toContain(c);
  });

  it("Einladung legt das Konto an oder ergänzt die Rolle", async () => {
    const email = `invite-${randomUUID()}@example.invalid`;
    expect(await code(inviteStaff(db, admin, email, "admin"))).toBe("forbidden");
    expect(await code(inviteStaff(db, owner, "keine-adresse", "admin"))).toBe("invalid");
    const first = await inviteStaff(db, owner, email.toUpperCase(), "admin");
    expect(first.created).toBe(true);
    expect(first.email).toBe(email);
    const again = await inviteStaff(db, owner, email, "owner");
    expect(again.created).toBe(false);
    expect(again.userId).toBe(first.userId);
    expect((await rolesOf(db, first.userId)).sort()).toEqual(["admin", "owner"]);
    const { rows } = await listUsers(db, { q: email, filter: "staff" });
    expect(rows[0]?.roles.sort()).toEqual(["admin", "owner"]);
  });
});
