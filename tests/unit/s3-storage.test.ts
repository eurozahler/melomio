// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createS3Storage } from "@/storage/s3";

/** Simulierter S3-Speicher (kein Netz): merkt sich Objekte im Arbeitsspeicher. */
function fakeS3() {
  const objects = new Map<string, Buffer>();
  const send = async (cmd: { constructor: { name: string }; input: { Key: string; Body?: unknown } }) => {
    const name = cmd.constructor.name;
    if (name === "PutObjectCommand") {
      const chunks: Buffer[] = [];
      for await (const c of cmd.input.Body as Readable) chunks.push(Buffer.from(c));
      objects.set(cmd.input.Key, Buffer.concat(chunks));
      return {};
    }
    if (name === "GetObjectCommand") {
      const data = objects.get(cmd.input.Key);
      if (!data) throw Object.assign(new Error("not found"), { name: "NoSuchKey" });
      return { Body: Readable.from(data), ContentLength: data.length };
    }
    if (name === "DeleteObjectCommand") {
      objects.delete(cmd.input.Key);
      return {};
    }
    throw new Error(name);
  };
  return { objects, client: { send } as never };
}

const CONFIG = {
  endpoint: "https://fsn1.your-objectstorage.com",
  region: "fsn1",
  bucket: "melomio",
  accessKeyId: "x",
  secretAccessKey: "y",
};

describe("S3-Dateispeicher (Hetzner Object Storage)", () => {
  it("speichert, liest und löscht Dateien; unbekannte Schlüssel → null", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "s3-test-"));
    try {
      const file = path.join(dir, "a.mp3");
      await writeFile(file, "hallo");
      const { client, objects } = fakeS3();
      const storage = createS3Storage(CONFIG, client);
      await storage.putFile("songs/1/a.mp3", file);
      expect(objects.get("songs/1/a.mp3")?.toString()).toBe("hallo");
      const opened = await storage.open("songs/1/a.mp3");
      expect(opened?.size).toBe(5);
      expect(await new Response(opened!.stream).text()).toBe("hallo");
      await storage.delete("songs/1/a.mp3");
      expect(await storage.open("songs/1/a.mp3")).toBeNull();
      await expect(storage.open("../geheim")).rejects.toThrow(/Ungültiger Speicherschlüssel/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
