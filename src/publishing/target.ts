import { eq } from "drizzle-orm";
import type { AppEnv } from "@/config/env";
import type { Database } from "@/db/client";
import { appSettings, auditLogs } from "@/db/schema";
import type { StorageProvider } from "@/storage";
import * as dropbox from "./dropbox";
import { open, seal } from "./secret-box";

/**
 * Ziel für Veröffentlichungen (C7):
 * - storage: Video nur im eigenen Speicher ablegen (Testbetrieb, kein Dropbox nötig)
 * - dropbox: in den Dropbox-Ordner hochladen, den EasyGMV überwacht
 */
export interface PublishTarget {
  readonly name: string;
  upload(localFile: string, folder: string, filename: string): Promise<string>;
  remove(remotePath: string): Promise<void>;
}

export const DROPBOX_KEY = "dropbox_connection";
export const DEFAULT_FOLDER_KEY = "publication_default_folder";
const TOKEN_PURPOSE = "dropbox-refresh-token";

type StoredConnection = {
  sealedRefreshToken: string;
  accountName: string;
  connectedAt: string;
  connectedBy: string;
};

export async function getDropboxConnection(db: Database) {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, DROPBOX_KEY));
  const value = row?.value as StoredConnection | undefined;
  return value?.sealedRefreshToken ? value : null;
}

export async function saveDropboxConnection(
  db: Database,
  secret: string,
  p: { refreshToken: string; accountName: string; userId: string },
) {
  const value: StoredConnection = {
    sealedRefreshToken: seal(secret, TOKEN_PURPOSE, p.refreshToken),
    accountName: p.accountName,
    connectedAt: new Date().toISOString(),
    connectedBy: p.userId,
  };
  await db
    .insert(appSettings)
    .values({ key: DROPBOX_KEY, value, updatedBy: p.userId })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date(), updatedBy: p.userId },
    });
  await db.insert(auditLogs).values({
    actorUserId: p.userId,
    action: "dropbox.connect",
    entity: "setting",
    entityId: DROPBOX_KEY,
    newValue: { accountName: p.accountName },
  });
}

export async function disconnectDropbox(db: Database, userId: string) {
  await db.delete(appSettings).where(eq(appSettings.key, DROPBOX_KEY));
  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: "dropbox.disconnect",
    entity: "setting",
    entityId: DROPBOX_KEY,
  });
}

export async function getDefaultFolder(db: Database): Promise<string> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, DEFAULT_FOLDER_KEY));
  return typeof row?.value === "string" && row.value ? row.value : "/melomio";
}

export async function saveDefaultFolder(db: Database, folder: string, userId: string) {
  const value = dropbox.normalizeFolder(folder);
  await db
    .insert(appSettings)
    .values({ key: DEFAULT_FOLDER_KEY, value, updatedBy: userId })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date(), updatedBy: userId },
    });
  await db.insert(auditLogs).values({
    actorUserId: userId,
    action: "setting.update",
    entity: "setting",
    entityId: DEFAULT_FOLDER_KEY,
    newValue: value,
  });
  return value;
}

function storageTarget(storage: StorageProvider): PublishTarget {
  const key = (folder: string, filename: string) =>
    `veroeffentlicht/${dropbox
      .normalizeFolder(folder)
      .slice(1)
      .replace(/[^A-Za-z0-9/_-]/g, "_")}/${filename}`.replace(/\/+/g, "/");
  return {
    name: "storage",
    async upload(localFile, folder, filename) {
      const k = key(folder, filename);
      await storage.putFile(k, localFile);
      return k;
    },
    async remove(remotePath) {
      await storage.delete(remotePath);
    },
  };
}

function dropboxTarget(db: Database, env: AppEnv, f: typeof fetch = fetch): PublishTarget {
  const app = { appKey: env.DROPBOX_APP_KEY ?? "", appSecret: env.DROPBOX_APP_SECRET ?? "" };
  const accessToken = async () => {
    const conn = await getDropboxConnection(db);
    if (!conn) throw new Error("Dropbox ist nicht verbunden (Admin → Veröffentlichungen)");
    return dropbox.refreshAccessToken(
      app,
      open(env.BETTER_AUTH_SECRET, TOKEN_PURPOSE, conn.sealedRefreshToken),
      f,
    );
  };
  return {
    name: "dropbox",
    async upload(localFile, folder, filename) {
      const path = `${dropbox.normalizeFolder(folder)}/${filename}`.replace(/^\/\//, "/");
      return dropbox.uploadFile(await accessToken(), localFile, path, f);
    },
    async remove(remotePath) {
      await dropbox.deleteFile(await accessToken(), remotePath, f);
    },
  };
}

export function getPublishTarget(db: Database, env: AppEnv, storage: StorageProvider): PublishTarget {
  return env.PUBLISH_PROVIDER === "dropbox" ? dropboxTarget(db, env) : storageTarget(storage);
}
