"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import {
  approveLyrics,
  LyricsActionError,
  requestAiRevision,
  saveCustomerEdit,
  type LyricsActionErrorCode,
} from "@/orders/lyrics";
import { getSenderBoss } from "@/server/jobs";
import { getSessionUser } from "@/server/session";

/**
 * Server-Aktionen der Songtext-Prüfseite. Von außen direkt aufrufbar – deshalb prüft jede Aktion
 * Anmeldung, Eigentum an der Bestellung, Status und Eingaben (in src/orders/lyrics.ts).
 */

export type LyricsActionResult = { ok: true } | { ok: false; error: LyricsActionErrorCode | "generic" };

async function run(fn: (userId: string) => Promise<unknown>): Promise<LyricsActionResult> {
  const user = await getSessionUser();
  if (!user?.emailVerified) return { ok: false, error: "not_found" };
  try {
    await fn(user.id);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof LyricsActionError) return { ok: false, error: error.code };
    console.error("[Songtext-Aktion]", error);
    return { ok: false, error: "generic" };
  }
}

function checkRef(ref: unknown): string {
  if (typeof ref !== "string" || !/^M-[A-Z0-9]{6}$/.test(ref)) throw new LyricsActionError("not_found");
  return ref;
}

export async function saveLyricsEditAction(ref: unknown, lyrics: unknown) {
  return run((userId) => saveCustomerEdit(getDb(), checkRef(ref), userId, lyrics));
}

export async function requestRevisionAction(ref: unknown, feedback: unknown) {
  return run(async (userId) =>
    requestAiRevision(
      getDb(),
      await getSenderBoss(),
      checkRef(ref),
      userId,
      typeof feedback === "string" ? feedback : null,
    ),
  );
}

export async function approveLyricsAction(ref: unknown) {
  return run((userId) => approveLyrics(getDb(), checkRef(ref), userId));
}
