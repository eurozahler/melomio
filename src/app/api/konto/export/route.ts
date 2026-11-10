import { exportAccount } from "@/account/service";
import { getDb } from "@/db/client";
import { getSessionUser } from "@/server/session";

/** Datenexport (DSGVO Art. 15/20): alle gespeicherten Daten zum eigenen Konto als JSON. */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.emailVerified) return new Response("Nicht angemeldet", { status: 401 });
  const data = await exportAccount(getDb(), user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="melomio-daten-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
