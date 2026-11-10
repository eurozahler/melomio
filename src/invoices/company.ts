import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { appSettings, auditLogs, type InvoiceSeller } from "@/db/schema";

/**
 * Firmendaten für Rechnungen (und später Impressum), im Admin unter „Firma“ gepflegt.
 * Gespeichert in app_settings unter dem Schlüssel "company_profile"; Änderungen im Audit-Log.
 * Bereits ausgestellte Rechnungen ändern sich dadurch nicht (Angaben sind dort eingefroren).
 */

export const COMPANY_KEY = "company_profile";

const text = (max: number) => z.string().trim().max(max);

export const companySchema = z
  .object({
    name: text(120).min(2, { error: "Firmenname fehlt" }),
    street: text(120).min(2, { error: "Straße fehlt" }),
    postalCode: text(10).regex(/^\d{4,5}$/, { error: "Postleitzahl ungültig" }),
    city: text(80).min(2, { error: "Ort fehlt" }),
    country: text(60).min(2),
    managingDirector: text(120).min(2, { error: "Geschäftsführer fehlt" }),
    registerCourt: text(80),
    registerNumber: text(40),
    vatId: text(20).regex(/^(DE\d{9})?$/, { error: "USt-IdNr. muss DE + 9 Ziffern sein" }),
    taxNumber: text(30),
    email: z.email({ error: "E-Mail ungültig" }),
    phone: text(40),
    website: text(80),
  })
  .refine((c) => c.vatId !== "" || c.taxNumber !== "", {
    error: "USt-IdNr. oder Steuernummer wird benötigt",
    path: ["vatId"],
  });

export type CompanyProfile = z.infer<typeof companySchema>;

export const EMPTY_COMPANY: CompanyProfile = {
  name: "",
  street: "",
  postalCode: "",
  city: "",
  country: "Deutschland",
  managingDirector: "",
  registerCourt: "",
  registerNumber: "",
  vatId: "",
  taxNumber: "",
  email: "",
  phone: "",
  website: "melomio.de",
};

/** Gespeicherte Firmendaten (roh, evtl. unvollständig) und ob sie für Rechnungen ausreichen. */
export async function getCompanyProfile(
  db: Database,
): Promise<{ profile: CompanyProfile; complete: boolean }> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, COMPANY_KEY));
  const stored = { ...EMPTY_COMPANY, ...((row?.value as Partial<CompanyProfile> | undefined) ?? {}) };
  return { profile: stored, complete: companySchema.safeParse(stored).success };
}

export class CompanyProfileError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join("; "));
    this.name = "CompanyProfileError";
  }
}

export async function saveCompanyProfile(db: Database, input: unknown, actorUserId: string) {
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) throw new CompanyProfileError(parsed.error.issues.map((i) => i.message));
  const value = parsed.data;
  await db.transaction(async (tx) => {
    const [old] = await tx.select().from(appSettings).where(eq(appSettings.key, COMPANY_KEY));
    await tx
      .insert(appSettings)
      .values({ key: COMPANY_KEY, value, updatedBy: actorUserId })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedBy: actorUserId, updatedAt: new Date() },
      });
    await tx.insert(auditLogs).values({
      actorUserId,
      action: "company.update",
      entity: "app_setting",
      entityId: COMPANY_KEY,
      oldValue: old?.value ?? null,
      newValue: value,
    });
  });
  return value;
}

/** Verkäuferangaben für den Rechnungskopf. */
export function toSeller(c: CompanyProfile): InvoiceSeller {
  const register = c.registerCourt && c.registerNumber ? `${c.registerCourt}, ${c.registerNumber}` : null;
  return {
    name: c.name,
    lines: [
      c.street,
      `${c.postalCode} ${c.city}`,
      ...(c.country && c.country !== "Deutschland" ? [c.country] : []),
    ],
    email: c.email,
    managingDirector: c.managingDirector,
    register,
    vatId: c.vatId || null,
    taxNumber: c.taxNumber || null,
    phone: c.phone || null,
    website: c.website || null,
  };
}

/** Platzhalter für Testrechnungen, solange keine Firmendaten hinterlegt sind (nur Testbetrieb). */
export const TEST_SELLER: InvoiceSeller = {
  name: "melomio (Firmendaten fehlen – im Admin unter „Firma“ eintragen)",
  lines: ["Musterstraße 1", "12345 Musterstadt"],
  email: null,
  managingDirector: "—",
  register: null,
  vatId: null,
  taxNumber: null,
  phone: null,
  website: "melomio.de",
};
