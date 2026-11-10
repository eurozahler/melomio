import { createReadStream } from "node:fs";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { assertSafeKey } from "./keys";
import { createS3Storage } from "./s3";

/**
 * Dateispeicher hinter einer austauschbaren Schnittstelle (docs/ARCHITEKTUR.md, Abschnitt 3).
 * - local: Ordner auf dem Rechner (Testbetrieb), außerhalb von public/ – nie direkt abrufbar
 * - s3:    Hetzner Object Storage (folgt mit dem Livebetrieb)
 * Dateien werden ausschließlich über geprüfte Server-Routen ausgeliefert.
 */
export interface StorageProvider {
  readonly name: string;
  /** Legt eine lokale Datei unter dem Schlüssel ab (z. B. "songs/<bestellung>/<kandidat>.mp3"). */
  putFile(key: string, sourceFile: string): Promise<void>;
  /** Liefert Größe und einen lesbaren Datenstrom, oder null, wenn es die Datei nicht gibt. */
  open(key: string): Promise<{ size: number; stream: ReadableStream<Uint8Array> } | null>;
  delete(key: string): Promise<void>;
}

export { assertSafeKey } from "./keys";

export function createLocalStorage(baseDir: string): StorageProvider {
  const root = path.resolve(baseDir);
  const resolve = (key: string) => {
    assertSafeKey(key);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error(`Speicherschlüssel außerhalb des Speichers: ${key}`);
    return full;
  };
  return {
    name: "local",
    async putFile(key, sourceFile) {
      const target = resolve(key);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(sourceFile, target);
    },
    async open(key) {
      const file = resolve(key);
      try {
        const info = await stat(file);
        return { size: info.size, stream: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array> };
      } catch {
        return null;
      }
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
  };
}

type StorageEnv = {
  STORAGE_PROVIDER: string;
  STORAGE_LOCAL_DIR: string;
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
};

let s3Cache: StorageProvider | undefined;

export function getStorage(env: StorageEnv): StorageProvider {
  if (env.STORAGE_PROVIDER === "s3") {
    if (!env.S3_ENDPOINT || !env.S3_REGION || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)
      throw new Error("S3-Zugangsdaten fehlen");
    s3Cache ??= createS3Storage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    });
    return s3Cache;
  }
  return createLocalStorage(env.STORAGE_LOCAL_DIR);
}
