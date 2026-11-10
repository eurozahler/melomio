// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createOccasion,
  discardDraft,
  getQuestionnaireEditor,
  publishDraft,
  saveDraft,
  startDraft,
  updateOccasion,
  validateQuestionnaire,
  type DraftQuestion,
} from "@/admin/questionnaire";
import { seed } from "@/db/seed";
import { auditLogs, occasions, questionnaireVersions, users } from "@/db/schema";
import { connectTestDb } from "./helpers";

const { db, pool } = connectTestDb();
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", async (orig) => ({
  ...(await orig<typeof import("@/db/client")>()),
  getDb: () => db,
}));
let actor: string;

beforeAll(async () => {
  await seed(db);
  actor = (await db.select().from(users).limit(1))[0]?.id ?? "";
  if (!actor) {
    actor = "builder-admin";
    await db.insert(users).values({ id: actor, email: "builder@example.invalid" }).onConflictDoNothing();
  }
});

afterAll(async () => {
  // Aufräumen: andere Tests zählen die Anlässe der Beispieldaten
  const [o] = await db.select().from(occasions).where(eq(occasions.slug, slug));
  if (o) {
    await db.delete(questionnaireVersions).where(eq(questionnaireVersions.occasionId, o.id));
    await db.delete(auditLogs).where(eq(auditLogs.entityId, o.id));
    await db.delete(occasions).where(eq(occasions.id, o.id));
  }
  await pool.end();
});

const Q = (over: Partial<DraftQuestion>): DraftQuestion => ({
  key: "recipient_name",
  type: "text",
  label: "Wie heißt deine Mama?",
  help: null,
  placeholder: null,
  required: true,
  maxLength: 80,
  condition: null,
  options: [],
  ...over,
});

const slug = `muttertag-${Date.now().toString(36)}`;

describe("Fragebogen-Builder (C6)", () => {
  it("prüft Kennungen, Auswahlantworten und Bedingungen verständlich", () => {
    expect(validateQuestionnaire([Q({}), Q({})]).problems).toContain(
      "Frage 2: Kennung „recipient_name“ kommt doppelt vor",
    );
    expect(
      validateQuestionnaire([Q({ type: "single_choice", options: [{ value: "ja", label: "Ja" }] })])
        .problems[0],
    ).toMatch(/mindestens zwei Antworten/);
    expect(
      validateQuestionnaire([
        Q({ condition: { questionKey: "spaeter", anyOf: ["ja"] } }),
        Q({ key: "spaeter" }),
      ]).problems[0],
    ).toMatch(/frühere Frage/);
  });

  it("neuer Anlass → Entwurf → veröffentlichen → einblenden; Kunden sehen die neue Fassung", async () => {
    await createOccasion(db, { slug, name: "Muttertag", description: "Für die beste Mama" }, actor);
    // ohne veröffentlichte Fassung nicht einblendbar
    await expect(
      updateOccasion(db, slug, { name: "Muttertag", description: "", active: true }, actor),
    ).rejects.toThrow(/Erst veröffentlichen/);

    await saveDraft(
      db,
      slug,
      [
        Q({}),
        Q({
          key: "kochen",
          type: "single_choice",
          label: "Kocht sie gern?",
          required: false,
          maxLength: null,
          options: [
            { value: "ja", label: "Ja" },
            { value: "nein", label: "Nein" },
          ],
        }),
        Q({
          key: "lieblingsgericht",
          type: "text",
          label: "Ihr bestes Gericht?",
          required: false,
          condition: { questionKey: "kochen", anyOf: ["ja"] },
        }),
      ],
      actor,
    );
    expect(await publishDraft(db, slug, actor)).toBe(1);
    await updateOccasion(
      db,
      slug,
      { name: "Muttertag", description: "Für die beste Mama", active: true },
      actor,
    );

    const { getQuestionnaire } = await import("@/server/catalog");
    const live = await getQuestionnaire(slug);
    expect(live?.questions.map((q) => q.key)).toEqual(["recipient_name", "kochen", "lieblingsgericht"]);
    expect(live?.questions[2]?.condition).toEqual({ questionKey: "kochen", anyOf: ["ja"] });
  });

  it("ein neuer Entwurf kopiert die Fassung; Änderungen sind erst nach Veröffentlichen live", async () => {
    await startDraft(db, slug, actor);
    const editor = await getQuestionnaireEditor(db, slug);
    expect(editor?.draft?.version).toBe(2);
    expect(editor?.draft?.questions).toHaveLength(3);

    await saveDraft(db, slug, [Q({ label: "Wie heißt deine Mutter?" })], actor);
    const { getQuestionnaire } = await import("@/server/catalog");
    expect((await getQuestionnaire(slug))?.questions).toHaveLength(3); // noch die alte Fassung

    await discardDraft(db, slug, actor);
    expect((await getQuestionnaire(slug))?.questions).toHaveLength(3);
    expect((await getQuestionnaireEditor(db, slug))?.draft).toBeNull();
  });

  it("ungültige Entwürfe werden nicht gespeichert", async () => {
    await startDraft(db, slug, actor);
    await expect(saveDraft(db, slug, [], actor)).rejects.toThrow(/Mindestens eine Frage/);
    const [u] = await db.select().from(users).where(eq(users.id, actor));
    expect(u).toBeTruthy();
  });
});
