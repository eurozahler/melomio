import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { questionnaireDrafts } from "@/db/schema";
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

/** Lädt den Entwurf für einen Anlass. Gehört der Entwurf zu einem anderen Anlass, beginnt man neu. */
export async function loadDraft(cookieId: string | undefined, occasionId: string): Promise<DraftData> {
  if (!isValidDraftCookieId(cookieId)) return emptyDraft();
  const [row] = await getDb()
    .select()
    .from(questionnaireDrafts)
    .where(and(eq(questionnaireDrafts.cookieId, cookieId), gt(questionnaireDrafts.expiresAt, new Date())));
  if (!row || row.occasionId !== occasionId) return emptyDraft();
  const parsed = draftDataSchema.safeParse(row.data);
  return parsed.success ? parsed.data : emptyDraft();
}

/** Speichert (oder ersetzt) den Entwurf zu diesem Cookie. */
export async function storeDraft(cookieId: string, occasionId: string, data: DraftData): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000);
  await getDb()
    .insert(questionnaireDrafts)
    .values({ cookieId, occasionId, data, expiresAt })
    .onConflictDoUpdate({
      target: questionnaireDrafts.cookieId,
      set: { occasionId, data, expiresAt, updatedAt: now },
    });
}
