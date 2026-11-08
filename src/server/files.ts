import "server-only";
import { getEnv } from "@/config/env";
import { getStorage } from "@/storage";

/** Liefert eine gespeicherte Datei als Antwort aus (Server-Routen). Nie direkt aus dem Speicherordner. */
export async function fileResponse(
  storageKey: string,
  options: { contentType: string; filename: string; download: boolean },
): Promise<Response> {
  const file = await getStorage(getEnv()).open(storageKey);
  if (!file) return new Response("Nicht gefunden", { status: 404 });
  return new Response(file.stream, {
    headers: {
      "Content-Type": options.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": `${options.download ? "attachment" : "inline"}; filename="${options.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
