"use server";

import { refresh } from "next/cache";
import { activatePromptVersion, PromptError, savePromptVersion, testPrompt } from "@/admin/prompts";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { getLyricsProvider } from "@/lyrics";
import { getAdminUser } from "@/server/admin";
import type { AdminResult } from "../actions";

export async function savePromptAction(input: unknown): Promise<AdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  try {
    const row = await savePromptVersion(getDb(), input, admin.id);
    refresh();
    return { ok: true, message: `Als Fassung ${row.version} gespeichert (noch nicht aktiv).` };
  } catch (error) {
    if (error instanceof PromptError) return { ok: false, error: error.problems.join(" · ") };
    console.error("[Admin Prompt]", error);
    return { ok: false, error: "Das hat nicht geklappt." };
  }
}

export async function activatePromptAction(id: unknown): Promise<AdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  if (typeof id !== "string") return { ok: false, error: "Nicht gefunden." };
  try {
    await activatePromptVersion(getDb(), id, admin.id);
    refresh();
    return { ok: true, message: "Aktiv – gilt ab sofort für neue Songtexte." };
  } catch (error) {
    if (error instanceof PromptError) return { ok: false, error: error.problems.join(" · ") };
    console.error("[Admin Prompt]", error);
    return { ok: false, error: "Das hat nicht geklappt." };
  }
}

export type PromptTestResult =
  | {
      ok: true;
      title: string;
      sections: Array<{ type: string; lines: string[] }>;
      model: string;
      provider: string;
    }
  | { ok: false; error: string };

/** Testlauf mit einer Beispielbestellung. Beim echten Anbieter kostenpflichtig (wenige Cent). */
export async function testPromptAction(input: unknown): Promise<PromptTestResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  try {
    const provider = getLyricsProvider(getEnv());
    const result = await testPrompt(provider, input);
    return {
      ok: true,
      title: result.title,
      sections: result.sections,
      model: result.model,
      provider: provider.name,
    };
  } catch (error) {
    if (error instanceof PromptError) return { ok: false, error: error.problems.join(" · ") };
    console.error("[Admin Prompt-Test]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 300) : "Das hat nicht geklappt.",
    };
  }
}
