import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { InvoiceLine, InvoiceParty, InvoiceSeller } from "@/db/schema";

/**
 * Rechnung als PDF (A4) mit allen Pflichtangaben nach § 14 Abs. 4 UStG – auch wenn bei
 * Beträgen bis 250 € eine Kleinbetragsrechnung (§ 33 UStDV) genügen würde.
 */

export type InvoicePdfData = {
  kind: "invoice" | "cancellation";
  number: string;
  cancelsNumber?: string | null;
  issuedAt: Date;
  serviceDate: Date;
  orderRef: string;
  seller: InvoiceSeller;
  buyer: InvoiceParty;
  lines: InvoiceLine[];
  netCents: number;
  taxCents: number;
  grossCents: number;
  currency: string;
  paymentNote: string | null;
  reason?: string | null;
  isTest: boolean;
};

const BRAND = rgb(0.486, 0.227, 0.929);
const GREY = rgb(0.42, 0.42, 0.45);
const BLACK = rgb(0.08, 0.08, 0.1);
const RED = rgb(0.8, 0.1, 0.1);

const dateFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

export function formatDate(d: Date) {
  return dateFmt.format(d);
}

export function formatMoney(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
}

function formatRate(bp: number) {
  return `${(bp / 100).toLocaleString("de-DE")} %`;
}

let logoCache: Uint8Array | null | undefined;
async function loadLogo(): Promise<Uint8Array | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = await readFile(path.join(process.cwd(), "public", "brand", "melomio-logo.png"));
  } catch {
    logoCache = null;
  }
  return logoCache;
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const title = data.kind === "cancellation" ? "Stornorechnung" : "Rechnung";
  doc.setTitle(`${title} ${data.number}`);
  doc.setAuthor(data.seller.name);
  doc.setCreator("melomio");
  const page = doc.addPage([595.28, 841.89]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Nur Zeichen, die die Standardschrift kennt (z. B. keine Emojis aus Kundennamen)
  const safe = (font: PDFFont, s: string) =>
    [...s.normalize("NFC")]
      .map((ch) => {
        try {
          font.encodeText(ch);
          return ch;
        } catch {
          return "?";
        }
      })
      .join("");

  const draw = (
    p: PDFPage,
    s: string,
    x: number,
    y: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; alignRight?: boolean } = {},
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10;
    const t = safe(font, s);
    const dx = opts.alignRight ? font.widthOfTextAtSize(t, size) : 0;
    p.drawText(t, { x: x - dx, y, size, font, color: opts.color ?? BLACK });
  };

  const left = 56;
  const right = 539;
  let y = 790;

  const logoBytes = await loadLogo();
  if (logoBytes) {
    const logo = await doc.embedPng(logoBytes);
    const h = 34;
    const w = (logo.width / logo.height) * h;
    page.drawImage(logo, { x: left, y: y - h + 10, width: w, height: h });
  } else {
    draw(page, "melomio", left, y - 14, { size: 22, font: bold, color: BRAND });
  }

  if (data.isTest) {
    draw(page, "TESTRECHNUNG – keine gültige Rechnung", right, y - 4, {
      size: 11,
      font: bold,
      color: RED,
      alignRight: true,
    });
  }

  // Absenderzeile + Empfänger
  y = 700;
  draw(page, [data.seller.name, ...data.seller.lines].join(" · "), left, y, { size: 7.5, color: GREY });
  y -= 18;
  draw(page, data.buyer.name, left, y, { size: 11 });
  for (const line of data.buyer.lines) {
    y -= 14;
    draw(page, line, left, y, { size: 11 });
  }
  if (data.buyer.email) {
    y -= 14;
    draw(page, data.buyer.email, left, y, { size: 10, color: GREY });
  }

  // Rechnungsangaben rechts
  const meta: Array<[string, string]> = [
    [data.kind === "cancellation" ? "Storno-Nr." : "Rechnungs-Nr.", data.number],
    ...(data.cancelsNumber ? ([["zu Rechnung", data.cancelsNumber]] as Array<[string, string]>) : []),
    ["Rechnungsdatum", dateFmt.format(data.issuedAt)],
    ["Leistungsdatum", dateFmt.format(data.serviceDate)],
    ["Bestellnummer", data.orderRef],
  ];
  let my = 700;
  for (const [k, v] of meta) {
    draw(page, k, 380, my, { size: 9, color: GREY });
    draw(page, v, right, my, { size: 9, font: bold, alignRight: true });
    my -= 14;
  }

  // Titel
  y = Math.min(y, my) - 40;
  draw(page, data.cancelsNumber ? `${title} zu ${data.cancelsNumber}` : title, left, y, {
    size: 18,
    font: bold,
  });
  y -= 22;
  if (data.kind === "cancellation") {
    draw(
      page,
      `Hiermit stornieren wir die Rechnung ${data.cancelsNumber ?? ""}${data.reason ? ` (${data.reason})` : ""}.`,
      left,
      y,
      { size: 10 },
    );
  } else {
    draw(page, "Vielen Dank für deine Bestellung bei melomio. Wir berechnen dir:", left, y, { size: 10 });
  }

  // Tabelle
  y -= 30;
  const cols = { pos: left, desc: left + 30, qty: 330, net: 400, rate: 455, gross: right };
  const header = (label: string, x: number, alignRight = false) =>
    draw(page, label, x, y, { size: 8.5, font: bold, color: GREY, alignRight });
  header("Pos.", cols.pos);
  header("Beschreibung", cols.desc);
  header("Menge", cols.qty + 20, true);
  header("Netto", cols.net + 30, true);
  header("USt.", cols.rate + 30, true);
  header("Brutto", cols.gross, true);
  y -= 8;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: GREY });
  data.lines.forEach((line, i) => {
    y -= 18;
    draw(page, String(i + 1), cols.pos, y);
    draw(page, String(line.quantity), cols.qty + 20, y, { alignRight: true });
    draw(page, formatMoney(line.netCents, data.currency), cols.net + 30, y, { alignRight: true });
    draw(page, formatRate(line.taxRateBp), cols.rate + 30, y, { alignRight: true });
    draw(page, formatMoney(line.grossCents, data.currency), cols.gross, y, { alignRight: true });
    // Beschreibung bricht um, damit sie nicht in die Spalte „Menge“ läuft
    const maxWidth = cols.qty - 15 - cols.desc;
    const rows: string[] = [];
    let current = "";
    for (const word of safe(regular, line.description).split(" ")) {
      const next = current ? `${current} ${word}` : word;
      if (current && regular.widthOfTextAtSize(next, 10) > maxWidth) {
        rows.push(current);
        current = word;
      } else current = next;
    }
    if (current) rows.push(current);
    rows.forEach((row, r) => {
      if (r > 0) y -= 13;
      draw(page, row, cols.desc, y);
    });
  });
  y -= 12;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: GREY });

  // Summen
  const rate = data.lines[0]?.taxRateBp ?? 0;
  const sums: Array<[string, number, boolean]> = [
    ["Summe netto", data.netCents, false],
    [`zzgl. Umsatzsteuer ${formatRate(rate)}`, data.taxCents, false],
    ["Gesamtbetrag", data.grossCents, true],
  ];
  for (const [label, cents, strong] of sums) {
    y -= strong ? 22 : 16;
    draw(page, label, 380, y, { size: strong ? 11 : 10, font: strong ? bold : regular });
    draw(page, formatMoney(cents, data.currency), right, y, {
      size: strong ? 11 : 10,
      font: strong ? bold : regular,
      alignRight: true,
    });
  }

  y -= 40;
  if (data.paymentNote) {
    draw(page, data.paymentNote, left, y, { size: 10 });
    y -= 14;
  }
  draw(page, "Das Leistungsdatum entspricht dem Tag der Bereitstellung des digitalen Inhalts.", left, y, {
    size: 9,
    color: GREY,
  });

  // Fußzeile mit Firmenangaben
  const s = data.seller;
  const footer = [
    [s.name, ...s.lines].join(" · "),
    [`Geschäftsführung: ${s.managingDirector}`, s.register ? `Handelsregister: ${s.register}` : null]
      .filter(Boolean)
      .join(" · "),
    [s.vatId ? `USt-IdNr.: ${s.vatId}` : null, s.taxNumber ? `Steuernummer: ${s.taxNumber}` : null]
      .filter(Boolean)
      .join(" · "),
    [s.email, s.phone, s.website].filter(Boolean).join(" · "),
  ].filter((l) => l.length > 0);
  let fy = 40 + footer.length * 11;
  page.drawLine({ start: { x: left, y: fy + 6 }, end: { x: right, y: fy + 6 }, thickness: 0.4, color: GREY });
  for (const line of footer) {
    draw(page, line, left, fy - 4, { size: 7.5, color: GREY });
    fy -= 11;
  }

  return doc.save();
}
