import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";

/**
 * Programmstand des Workers für die Startzeile – damit ein veralteter Worker sofort auffällt.
 * Git-Stand, falls verfügbar (lokal), sonst GIT_COMMIT aus der Umgebung (Server), sonst Dateidatum.
 */
export function workerVersion(): string {
  let commit = process.env.GIT_COMMIT?.slice(0, 7) ?? "";
  if (!commit) {
    try {
      commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      commit = "unbekannt";
    }
  }
  const built = statSync(path.join(process.cwd(), "src", "jobs", "handlers.ts")).mtime;
  const stamp = built.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${commit}, Code vom ${stamp}`;
}
