import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { occasions, questionnaireDrafts } from "@/db/schema";
import { draftDataSchema, emptyDraft, type DraftData } from "@/domain/draft";

/** Name des Cookies, über das ein Entwurf ohne Anmeldung wiedererkannt wird. */
export const DRAFT_COOKIE = "melomio_draft";
/** Entwürfe werden nach 30 Tagen gelöscht (Datensparsamkeit). */
export const DRAFT_TTL_DAYS = 30;

export function newDraftCookieId(): string {
  return randomBytes(32).toString("base64url");
}

export function isValidDraftCookieId(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function parse(data: unknown): DraftData {
  const parsed = draftDataSchema.safeParse(data);
  return parsed.success ? parsed.data : emptyDraft();
}

/**
 * Lädt den Entwurf für einen Anlass:
 * 1. Entwurf zum Cookie dieses Browsers – aber nur, wenn er niemand anderem gehört
 * 2. sonst (angemeldet) der neueste Entwurf des Kontos für diesen Anlass, z. B. von einem anderen Gerät
 */
export async function loadDraft(
  cookieId: string | undefined,
  occasionId: string,
  userId: string | null = null,
): Promise<DraftData> {
  const db = getDb();
  const now = new Date();
  if (isValidDraftCookieId(cookieId)) {
    const [row] = await db
      .select()
      .from(questionnaireDrafts)
      .where(and(eq(questionnaireDrafts.cookieId, cookieId), gt(questionnaireDrafts.expiresAt, now)));
    const ownedByOther = row?.userId && row.userId !== userId;
    if (row && !ownedByOther && row.occasionId === occasionId) return parse(row.data);
  }
  if (userId) {
    const [row] = await db
      .select()
      .from(questionnaireDrafts)
      .where(
        and(
          eq(questionnaireDrafts.userId, userId),
          eq(questionnaireDrafts.occasionId, occasionId),
          gt(questionnaireDrafts.expiresAt, now),
        ),
      )
      .orderBy(desc(questionnaireDrafts.updatedAt))
      .limit(1);
    if (row) return parse(row.data);
  }
  return emptyDraft();
}

/**
 * Speichert (oder ersetzt) den Entwurf zu diesem Cookie. Ist jemand angemeldet, wird der Entwurf
 * dem Konto zugeordnet. Ein Entwurf, der bereits einem ANDEREN Konto gehört, wird nie überschrieben.
 * @returns false, wenn der Entwurf einem anderen Konto gehört
 */
export async function storeDraft(
  cookieId: string,
  occasionId: string,
  data: DraftData,
  userId: string | null = null,
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000);
  const result = await getDb()
    .insert(questionnaireDrafts)
    .values({ cookieId, occasionId, data, expiresAt, userId })
    .onConflictDoUpdate({
      target: questionnaireDrafts.cookieId,
      set: { occasionId, data, expiresAt, updatedAt: now, ...(userId ? { userId } : {}) },
      setWhere: userId
        ? or(isNull(questionnaireDrafts.userId), eq(questionnaireDrafts.userId, userId))
        : isNull(questionnaireDrafts.userId),
    })
    .returning({ id: questionnaireDrafts.id });
  return result.length > 0;
}

/** Ordnet den Entwurf dieses Browsers dem Konto zu (nur, wenn er noch niemandem gehört). */
export async function attachDraftToUser(cookieId: string, userId: string): Promise<DraftData | null> {
  const [row] = await getDb()
    .update(questionnaireDrafts)
    .set({ userId, updatedAt: new Date() })
    .where(
      and(
        eq(questionnaireDrafts.cookieId, cookieId),
        gt(questionnaireDrafts.expiresAt, new Date()),
        or(isNull(questionnaireDrafts.userId), eq(questionnaireDrafts.userId, userId)),
      ),
    )
    .returning();
  return row ? parse(row.data) : null;
}

export type UserDraft = { occasionSlug: string; occasionName: string; updatedAt: Date; data: DraftData };

/** Entwürfe eines Kontos, neueste zuerst. */
export async function listUserDrafts(userId: string): Promise<UserDraft[]> {
  const rows = await getDb()
    .select({
      slug: occasions.slug,
      name: occasions.name,
      updatedAt: questionnaireDrafts.updatedAt,
      data: questionnaireDrafts.data,
    })
    .from(questionnaireDrafts)
    .innerJoin(occasions, eq(questionnaireDrafts.occasionId, occasions.id))
    .where(and(eq(questionnaireDrafts.userId, userId), gt(questionnaireDrafts.expiresAt, new Date())))
    .orderBy(desc(questionnaireDrafts.updatedAt));
  return rows.map((r) => ({
    occasionSlug: r.slug,
    occasionName: r.name.de,
    updatedAt: r.updatedAt,
    data: parse(r.data),
  }));
}
