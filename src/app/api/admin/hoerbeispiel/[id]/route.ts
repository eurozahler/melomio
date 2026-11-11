import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { LandingError, looksLikeMp3, setLandingSample } from "@/marketing/landing";
import { getAdminUser } from "@/server/admin";
import { getStorage } from "@/storage";

/** Hörbeispiel (MP3) für die Landingpage eines Anlasses hochladen bzw. entfernen (nur Admin). */

const MAX_BYTES = 15 * 1024 * 1024;


export async function POST(request: Request, { params }: RouteContext<"/api/admin/hoerbeispiel/[id]">) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Keine Berechtigung." }, { status: 404 });
  const { id } = await params;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024)
    return Response.json({ error: "Datei zu groß (höchstens 15 MB)." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Keine Datei." }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) return Response.json({ error: "Datei zu groß (höchstens 15 MB)." }, { status: 413 });
  if (!looksLikeMp3(buf)) return Response.json({ error: "Bitte eine MP3-Datei hochladen." }, { status: 400 });

  const storage = getStorage(getEnv());
  const key = `marketing/hoerbeispiele/${randomUUID()}.mp3`;
  const dir = await mkdtemp(path.join(tmpdir(), "melomio-sample-"));
  try {
    const tmp = path.join(dir, "s.mp3");
    await writeFile(tmp, buf);
    await storage.putFile(key, tmp);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  try {
    const old = await setLandingSample(getDb(), admin.id, id, key);
    if (old) await storage.delete(old).catch(() => {});
  } catch (error) {
    await storage.delete(key).catch(() => {});
    if (error instanceof LandingError)
      return Response.json({ error: "Bitte die Seite zuerst speichern." }, { status: 400 });
    throw error;
  }
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/admin/hoerbeispiel/[id]">) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Keine Berechtigung." }, { status: 404 });
  const { id } = await params;
  try {
    const old = await setLandingSample(getDb(), admin.id, id, null);
    if (old) await getStorage(getEnv()).delete(old).catch(() => {});
  } catch {
    return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
