import { loadLocalEnv } from "./load-env";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb, type Database } from "@/db/client";
import { occasions, orders, questionnaireVersions, users } from "@/db/schema";

loadLocalEnv();

export function connectTestDb() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST fehlt");
  return createDb(url, { max: 2 });
}

/** Legt einen Testkunden mit einer Bestellung an (setzt Beispieldaten voraus). */
export async function createUserWithOrder(db: Database) {
  const userId = randomUUID();
  await db.insert(users).values({ id: userId, email: `test-${userId}@example.invalid` });
  const [occasion] = await db.select().from(occasions).where(eq(occasions.slug, "geburtstag"));
  if (!occasion) throw new Error("Beispieldaten fehlen");
  const [version] = await db
    .select()
    .from(questionnaireVersions)
    .where(eq(questionnaireVersions.occasionId, occasion.id));
  if (!version) throw new Error("Fragebogen-Version fehlt");
  const [order] = await db
    .insert(orders)
    .values({
      publicRef: `T-${userId.slice(0, 8)}`,
      userId,
      occasionId: occasion.id,
      questionnaireVersionId: version.id,
      isTest: true,
    })
    .returning();
  if (!order) throw new Error("Bestellung konnte nicht angelegt werden");
  return { userId, order };
}
