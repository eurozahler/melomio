import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Verschlüsselung für Zugangsdaten, die erst im Betrieb entstehen (Dropbox-Token, E8).
 * AES-256-GCM; der Schlüssel wird aus dem Server-Geheimnis (Umgebungsvariable) abgeleitet –
 * eine kopierte Datenbank allein reicht nicht, um das Token zu lesen.
 */

function keyFrom(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "melomio", `melomio:${purpose}`, 32));
}

export function seal(secret: string, purpose: string, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret, purpose), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}

export function open(secret: string, purpose: string, sealed: string): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unbekanntes Format");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret, purpose), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
