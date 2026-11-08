import "server-only";
import { getEnv } from "@/config/env";

/** Gibt es das Test-Postfach? Nur im Testbetrieb mit EMAIL_PROVIDER=console. */
export function hasTestMailbox(): boolean {
  const env = getEnv();
  return env.isTestOperation && env.EMAIL_PROVIDER === "console";
}
