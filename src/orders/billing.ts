import { z } from "zod";
import type { BillingAddress, InvoiceParty } from "@/db/schema";

/**
 * Rechnungsanschrift für Firmenkunden (optional beim Kauf). Ohne Angabe geht die Rechnung an den
 * Namen bzw. die E-Mail-Adresse des Kontos (Kleinbetragsrechnung braucht keine Kundenanschrift).
 */
export const billingSchema = z.object({
  company: z.string().trim().min(2).max(120),
  contact: z.string().trim().max(120).default(""),
  street: z.string().trim().min(3).max(120),
  // Firmenrechnungen vorerst nur in Deutschland (EU-Ausland bräuchte „Reverse Charge“)
  postalCode: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/, { error: "PLZ ungültig" }),
  city: z.string().trim().min(2).max(80),
  country: z.literal("Deutschland").default("Deutschland"),
  vatId: z
    .string()
    .trim()
    .max(20)
    .transform((v) => v.replace(/\s/g, "").toUpperCase())
    .pipe(z.string().regex(/^(DE[0-9]{9})?$/, { error: "USt-IdNr. ungültig" }))
    .default(""),
});

export type { BillingAddress };
// Schema und Datenbanktyp müssen zusammenpassen
const _check: BillingAddress = {} as z.infer<typeof billingSchema>;
void _check;

export function invoiceBuyer(
  billing: BillingAddress | null,
  user: { name: string; email: string },
): InvoiceParty {
  if (!billing) return { name: user.name || user.email, lines: [], email: user.email };
  return {
    name: billing.company,
    lines: [
      ...(billing.contact ? [`z. Hd. ${billing.contact}`] : []),
      billing.street,
      `${billing.postalCode} ${billing.city}`,
      ...(billing.country && billing.country !== "Deutschland" ? [billing.country] : []),
      ...(billing.vatId ? [`USt-IdNr.: ${billing.vatId}`] : []),
    ],
    email: user.email,
  };
}
