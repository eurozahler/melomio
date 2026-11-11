import { readFile } from "node:fs/promises";

/**
 * Dropbox-Anbindung (C7): „Mit Dropbox verbinden“ (OAuth mit Offline-Zugriff → Refresh-Token),
 * Hochladen in einen Ordner, Löschen. EasyGMV überwacht den Ordner und veröffentlicht selbstständig.
 * Dokumentation: https://www.dropbox.com/developers/documentation/http/documentation
 */

export type DropboxApp = { appKey: string; appSecret: string };
type FetchFn = typeof fetch;

export function authorizeUrl(app: DropboxApp, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: app.appKey,
    response_type: "code",
    token_access_type: "offline",
    redirect_uri: redirectUri,
    state,
  });
  return `https://www.dropbox.com/oauth2/authorize?${q}`;
}

async function tokenRequest(app: DropboxApp, body: Record<string, string>, f: FetchFn) {
  const res = await f("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${app.appKey}:${app.appSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok)
    throw new Error(`Dropbox-Anmeldung fehlgeschlagen (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { access_token: string; refresh_token?: string; account_id?: string };
}

/** Code aus der Rückleitung gegen Zugangsdaten tauschen. */
export async function exchangeCode(app: DropboxApp, code: string, redirectUri: string, f: FetchFn = fetch) {
  const t = await tokenRequest(app, { code, grant_type: "authorization_code", redirect_uri: redirectUri }, f);
  if (!t.refresh_token) throw new Error("Dropbox hat kein Refresh-Token geliefert");
  return { accessToken: t.access_token, refreshToken: t.refresh_token };
}

export async function refreshAccessToken(app: DropboxApp, refreshToken: string, f: FetchFn = fetch) {
  return (await tokenRequest(app, { grant_type: "refresh_token", refresh_token: refreshToken }, f))
    .access_token;
}

/** Dropbox verlangt im Header „Dropbox-API-Arg“ reines ASCII – Umlaute als \\uXXXX. */
export function headerSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** Ordnerpfad prüfen und vereinheitlichen: beginnt mit „/“, keine „..“, kein „/“ am Ende. */
export function normalizeFolder(folder: string): string {
  const parts = folder
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.some((p) => p === "." || p === ".." || /[\\<>:"|?*\u0000-\u001f]/.test(p))) {
    throw new Error(`Ungültiger Ordner: ${folder}`);
  }
  return `/${parts.join("/")}`;
}

export async function accountName(accessToken: string, f: FetchFn = fetch): Promise<string> {
  const res = await f("https://api.dropboxapi.com/2/users/get_current_account", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Dropbox-Konto nicht lesbar (${res.status})`);
  const data = (await res.json()) as { name?: { display_name?: string }; email?: string };
  return data.name?.display_name ?? data.email ?? "Dropbox";
}

/** Datei hochladen (bis 150 MB); bei Namensgleichheit vergibt Dropbox einen neuen Namen. */
export async function uploadFile(
  accessToken: string,
  localFile: string,
  remotePath: string,
  f: FetchFn = fetch,
): Promise<string> {
  const data = await readFile(localFile);
  const res = await f("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": headerSafeJson({ path: remotePath, mode: "add", autorename: true, mute: false }),
    },
    body: data,
  });
  if (!res.ok)
    throw new Error(`Dropbox-Upload fehlgeschlagen (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const meta = (await res.json()) as { path_display?: string };
  return meta.path_display ?? remotePath;
}

export async function deleteFile(accessToken: string, remotePath: string, f: FetchFn = fetch): Promise<void> {
  const res = await f("https://api.dropboxapi.com/2/files/delete_v2", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path: remotePath }),
  });
  // schon weg (z. B. von EasyGMV verschoben) ist kein Fehler
  if (!res.ok && res.status !== 409) throw new Error(`Dropbox-Löschen fehlgeschlagen (${res.status})`);
}
