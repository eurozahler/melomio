import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Kurzlebige, signierte Datei-Links (Modul M9). Der Link enthält Datei-Art, Bestellung und
 * Ablaufzeit; die Signatur (HMAC-SHA256 mit dem geheimen Schlüssel) verhindert, dass jemand
 * einen Link verlängert oder auf eine andere Datei umbiegt.
 */

export type FileKind = "song" | "video";

function sign(secret: string, kind: FileKind, publicRef: string, exp: number): string {
  return createHmac("sha256", `melomio:file-links:${secret}`)
    .update(`${kind}|${publicRef}|${exp}`)
    .digest("base64url");
}

export function createSignedFilePath(
  secret: string,
  kind: FileKind,
  publicRef: string,
  ttlMinutes: number,
  now = Date.now(),
): string {
  const exp = Math.floor(now / 1000) + ttlMinutes * 60;
  return `/api/datei/${kind}/${encodeURIComponent(publicRef)}?exp=${exp}&sig=${sign(secret, kind, publicRef, exp)}`;
}

export type VerifyResult = "ok" | "expired" | "invalid";

export function verifySignedFile(
  secret: string,
  kind: FileKind,
  publicRef: string,
  exp: string | null,
  sig: string | null,
  now = Date.now(),
): VerifyResult {
  if (!exp || !sig || !/^\d{1,12}$/.test(exp)) return "invalid";
  const expected = Buffer.from(sign(secret, kind, publicRef, Number(exp)));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  if (Number(exp) * 1000 < now) return "expired";
  return "ok";
}
