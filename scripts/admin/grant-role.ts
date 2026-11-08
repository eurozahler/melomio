/**
 * Vergibt eine Admin-Rolle an ein bestehendes Konto.
 * Aufruf: npm run admin:rolle -- deine@adresse.de owner     (oder: admin)
 * Das Konto muss vorher auf der Webseite registriert und bestätigt sein.
 */
import { loadEnvConfig } from "@next/env";
import { grantRole } from "../../src/admin/service";
import { createDb } from "../../src/db/client";

loadEnvConfig(process.cwd());

async function main() {
  const [email, role = "owner"] = process.argv.slice(2).filter((a) => a !== "--");
  if (!email || (role !== "owner" && role !== "admin")) {
    console.error("Aufruf: npm run admin:rolle -- deine@adresse.de owner|admin");
    process.exit(1);
  }
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  try {
    const user = await grantRole(db, email, role);
    if (!user) {
      console.error(
        `Kein Konto mit der Adresse ${email} gefunden – bitte zuerst auf der Webseite registrieren.`,
      );
      process.exit(1);
    }
    console.log(`✓ ${user.email} hat jetzt die Rolle „${role}“. Admin-Bereich: /admin`);
  } finally {
    await pool.end();
  }
}
main();
