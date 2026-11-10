// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PhotoError, sanitizeImage } from "@/orders/photos";

describe("Fotos bereinigen (C2)", () => {
  it("entfernt Metadaten (EXIF/GPS), dreht nach Kamera-Angabe und verkleinert", async () => {
    // Querformat-Bild, das laut EXIF um 90° gedreht angezeigt werden soll, mit Kameradaten
    const input = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#336699" } })
      .withMetadata({ orientation: 6, exif: { IFD0: { Make: "TestKamera", Copyright: "geheim" } } })
      .jpeg()
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeTruthy();

    const out = await sanitizeImage(input);
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    // gedreht: jetzt Hochformat, längste Seite höchstens 1920
    expect(out.height).toBe(1920);
    expect(out.width).toBe(1280);
  });

  it("lehnt Nicht-Bilder und unbekannte Formate ab", async () => {
    await expect(sanitizeImage(Buffer.from("<script>alert(1)</script>"))).rejects.toBeInstanceOf(PhotoError);
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } })
      .gif()
      .toBuffer();
    await expect(sanitizeImage(gif)).rejects.toMatchObject({ code: "not_image" });
  });

  it("lehnt zu große Dateien ab", async () => {
    await expect(sanitizeImage(Buffer.alloc(16 * 1024 * 1024))).rejects.toMatchObject({ code: "too_large" });
  });
});
