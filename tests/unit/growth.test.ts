// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isValidIban } from "@/affiliates/service";
import { memorialTextFrom } from "@/jobs/video";
import { parsePublication } from "@/orders/checkout";
import { buildPriceItems } from "@/orders/pricing";
import {
  deleteFile,
  exchangeCode,
  headerSafeJson,
  normalizeFolder,
  refreshAccessToken,
  uploadFile,
} from "@/publishing/dropbox";
import { open, seal } from "@/publishing/secret-box";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const base = { productSlug: "song", name: "Persönlicher Song mit Video", unitGrossCents: 3900 };
const voucher = (kind: "percent" | "fixed", value: number) =>
  ({ type: "voucher", code: "X", voucher: { id: "v", kind, value } }) as never;

describe("Preisberechnung mit Veröffentlichung und Codes", () => {
  it("ohne Rabatte: nur der Song", () => {
    const r = buildPriceItems(base, { publicationPct: null, code: null });
    expect(r.grossCents).toBe(3900);
    expect(r.items).toHaveLength(1);
  });

  it("Veröffentlichung 10 % + Affiliate 10 %: nacheinander, Code-Prozent vom Rest", () => {
    const r = buildPriceItems(base, {
      publicationPct: 10,
      code: { type: "affiliate", code: "ANNA10", codeId: "c", affiliateId: "a", discountPct: 10 },
    });
    expect(r.publicationDiscountCents).toBe(390);
    expect(r.codeDiscountCents).toBe(351);
    expect(r.grossCents).toBe(3159);
    expect(r.items.map((i) => i.productSlug)).toEqual(["song", "publication", "affiliate"]);
    expect(r.items.reduce((s, i) => s + i.unitGrossCents, 0)).toBe(r.grossCents);
  });

  it("Festbetrag-Gutschein größer als der Rest → 0 €, nie negativ", () => {
    const r = buildPriceItems(base, { publicationPct: 20, code: voucher("fixed", 5000) });
    expect(r.grossCents).toBe(0);
    expect(r.codeDiscountCents).toBe(3120);
  });

  it("0 % Veröffentlichung erzeugt keine Rabattzeile", () => {
    expect(buildPriceItems(base, { publicationPct: 0, code: null }).items).toHaveLength(1);
  });
});

describe("Zustimmung zur Veröffentlichung aus dem Formular", () => {
  it("nur mit ausdrücklichem consent: true", () => {
    expect(parsePublication(null)).toBeNull();
    expect(parsePublication({ photos: true })).toBeNull();
    expect(parsePublication({ consent: true, photos: true, title: false })).toEqual({
      photos: true,
      title: false,
      memorial: false,
    });
    expect(parsePublication({ consent: true, photos: "ja" })).toBe("invalid");
    expect(parsePublication("ja")).toBe("invalid");
  });
});

describe("IBAN-Prüfung", () => {
  it("erkennt gültige und ungültige IBANs", () => {
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(isValidIban("DE89370400440532013001")).toBe(false);
    expect(isValidIban("DE8937040044053201300")).toBe(false);
    expect(isValidIban("GB82WEST12345698765432")).toBe(true);
  });
});

describe("Abschiedsvideo-Texte (C11)", () => {
  it("Name, Daten im deutschen Format, Spruch, Aufruf zum Teilen", () => {
    const t = memorialTextFrom({ deceased_name: "Erika Muster", born: "1950-04-03", died: "2026-11-01" });
    expect(t.name).toBe("Erika Muster");
    expect(t.dates).toBe("* 03.04.1950   † 01.11.2026");
    expect(t.saying).toBe("In liebevoller Erinnerung");
    expect(t.share).toContain("Erika Muster auf eine letzte Reise um die Welt");
  });
});

describe("Verschlüsseltes Dropbox-Token", () => {
  it("lässt sich nur mit demselben Geheimnis öffnen, Manipulation fällt auf", () => {
    const sealed = seal("geheim-1", "dropbox", "refresh-token-123");
    expect(sealed).not.toContain("refresh-token-123");
    expect(open("geheim-1", "dropbox", sealed)).toBe("refresh-token-123");
    expect(() => open("geheim-2", "dropbox", sealed)).toThrow();
    const parts = sealed.split(".");
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("A") ? "BB" : "AA");
    expect(() => open("geheim-1", "dropbox", parts.join("."))).toThrow();
  });
});

describe("Dropbox-Anbindung", () => {
  it("Ordnerpfade werden vereinheitlicht, „..“ wird abgelehnt", () => {
    expect(normalizeFolder("Liebe/")).toBe("/Liebe");
    expect(normalizeFolder("/TikTok//Geburtstag ")).toBe("/TikTok/Geburtstag");
    expect(() => normalizeFolder("/a/../b")).toThrow();
  });

  it("Header-JSON enthält nur ASCII (Umlaute als \\u-Folgen)", () => {
    expect(headerSafeJson({ path: "/Hochzeit/Glück.mp4" })).toBe('{"path":"/Hochzeit/Gl\\u00fcck.mp4"}');
  });

  it("Token-Tausch, Erneuern, Upload und Löschen sprechen die richtigen Endpunkte an", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/oauth2/token")) {
        return Response.json({ access_token: "AT", refresh_token: "RT" });
      }
      if (url.endsWith("/files/upload")) return Response.json({ path_display: "/Liebe/2026-11-11-M-1.mp4" });
      return new Response(null, { status: 409 });
    }) as unknown as typeof fetch;
    const app = { appKey: "key", appSecret: "secret" };

    expect(await exchangeCode(app, "CODE", "https://x/cb", fakeFetch)).toEqual({
      accessToken: "AT",
      refreshToken: "RT",
    });
    expect(String(calls[0]!.init.body)).toContain("grant_type=authorization_code");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("key:secret").toString("base64")}`,
    );
    expect(await refreshAccessToken(app, "RT", fakeFetch)).toBe("AT");

    const dir = await mkdtemp(path.join(tmpdir(), "dbx-"));
    try {
      const file = path.join(dir, "v.mp4");
      await writeFile(file, "video");
      expect(await uploadFile("AT", file, "/Liebe/2026-11-11-M-1.mp4", fakeFetch)).toBe(
        "/Liebe/2026-11-11-M-1.mp4",
      );
      const upload = calls.find((c) => c.url.endsWith("/files/upload"))!;
      expect(JSON.parse((upload.init.headers as Record<string, string>)["Dropbox-API-Arg"]!)).toMatchObject({
        path: "/Liebe/2026-11-11-M-1.mp4",
        mode: "add",
        autorename: true,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    // 409 = schon gelöscht → kein Fehler
    await expect(deleteFile("AT", "/Liebe/weg.mp4", fakeFetch)).resolves.toBeUndefined();
  });
});
