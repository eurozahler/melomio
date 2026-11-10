// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { activatePromptVersion, listPromptVersions, savePromptVersion, testPrompt } from "@/admin/prompts";
import { getActiveSystemPrompt } from "@/lyrics";
import { mockLyricsProvider } from "@/lyrics/mock";
import { LYRICS_SYSTEM_PROMPT_V1 } from "@/lyrics/prompts";
import { seed } from "@/db/seed";
import { users } from "@/db/schema";
import { connectTestDb } from "./helpers";

const { db, pool } = connectTestDb();
afterAll(async () => {
  await pool.end();
});

describe("Prompt-Verwaltung (C6)", () => {
  it("neue Fassung → aktivieren → zurück zur alten Fassung", async () => {
    await seed(db);
    await db
      .insert(users)
      .values({ id: "prompt-admin", email: "prompt-admin@example.invalid" })
      .onConflictDoNothing();
    const actor = "prompt-admin";
    const before = await getActiveSystemPrompt(db);
    const row = await savePromptVersion(
      db,
      {
        template: `${LYRICS_SYSTEM_PROMPT_V1}\n\nZusatz: Reime besonders sauber.`,
        model: "claude-sonnet-5-5",
      },
      actor,
    );
    expect(row.active).toBe(false);
    expect((await getActiveSystemPrompt(db)).template).toBe(before.template);

    await activatePromptVersion(db, row.id, actor);
    const now = await getActiveSystemPrompt(db);
    expect(now.template).toContain("Zusatz: Reime besonders sauber.");
    expect(now.model).toBe("claude-sonnet-5-5");
    expect((await listPromptVersions(db)).filter((v) => v.active)).toHaveLength(1);

    if (before.id) {
      await activatePromptVersion(db, before.id, actor);
      expect((await getActiveSystemPrompt(db)).template).toBe(before.template);
    }
  });

  it("lehnt zu kurze Prompts und unbekannte Modelle ab; Testlauf mit dem Test-Baustein", async () => {
    await expect(
      savePromptVersion(db, { template: "kurz", model: "claude-opus-5-5" }, "prompt-admin"),
    ).rejects.toThrow(/zu kurz/);
    await expect(
      savePromptVersion(db, { template: LYRICS_SYSTEM_PROMPT_V1, model: "gpt" }, "prompt-admin"),
    ).rejects.toThrow(/Unbekanntes Modell/);
    const result = await testPrompt(mockLyricsProvider, {
      template: LYRICS_SYSTEM_PROMPT_V1,
      model: "claude-opus-5-5",
    });
    expect(result.sections.length).toBeGreaterThan(0);
  });
});
