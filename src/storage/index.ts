import { createReadStream } from "node:fs";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

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

/** Schlüssel nur aus erlaubten Zeichen – verhindert Pfade wie "../../geheim". */
export function assertSafeKey(key: string): void {
  if (!/^[a-z0-9][a-z0-9/_.-]*$/i.test(key) || key.includes("..") || key.startsWith("/")) {
    throw new Error(`Ungültiger Speicherschlüssel: ${key}`);
  }
}

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

export function getStorage(env: { STORAGE_PROVIDER: string; STORAGE_LOCAL_DIR: string }): StorageProvider {
  if (env.STORAGE_PROVIDER === "s3") throw new Error("STORAGE_PROVIDER=s3 ist noch nicht umgesetzt (folgt im Livebetrieb)");
  return createLocalStorage(env.STORAGE_LOCAL_DIR);
}
