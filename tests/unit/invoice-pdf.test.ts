// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderInvoicePdf } from "@/invoices/pdf";

describe("Rechnungs-PDF", () => {
  it("erzeugt ein lesbares A4-PDF – auch mit Umlauten, €-Zeichen und Emojis im Namen", async () => {
    const bytes = await renderInvoicePdf({
      kind: "invoice",
      number: "TEST-RE-2026-00001",
      issuedAt: new Date("2026-11-10T12:00:00Z"),
      serviceDate: new Date("2026-11-10T12:00:00Z"),
      orderRef: "M-ABC123",
      seller: {
        name: "Beispiel UG (haftungsbeschränkt)",
        lines: ["Hauptstraße 5", "80331 München"],
        email: "hallo@melomio.de",
        managingDirector: "Erika Muster",
        register: "Amtsgericht München, HRB 123456",
        vatId: "DE123456789",
        taxNumber: null,
        phone: null,
        website: "melomio.de",
      },
      buyer: { name: "Jürgen Öztürk 🎉", lines: [], email: "j@example.com" },
      lines: [
        {
          description: "Persönlicher Song mit Video",
          quantity: 1,
          netCents: 839,
          taxCents: 160,
          grossCents: 999,
          taxRateBp: 1900,
        },
      ],
      netCents: 839,
      taxCents: 160,
      grossCents: 999,
      currency: "EUR",
      paymentNote: "Bezahlt am 10.11.2026 über Mollie.",
      isTest: true,
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(Math.round(doc.getPage(0).getWidth())).toBe(595);
    expect(doc.getTitle()).toBe("Rechnung TEST-RE-2026-00001");
  });
});
