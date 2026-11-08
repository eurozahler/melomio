/**
 * Wird einmal beim Start des Next.js-Servers ausgeführt.
 * Die eigentliche Prüfung liegt in instrumentation-node.ts, weil sie Node.js-Funktionen braucht.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
