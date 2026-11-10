/** Schlüssel nur aus erlaubten Zeichen – verhindert Pfade wie "../../geheim". */
export function assertSafeKey(key: string): void {
  if (!/^[a-z0-9][a-z0-9/_.-]*$/i.test(key) || key.includes("..") || key.startsWith("/")) {
    throw new Error(`Ungültiger Speicherschlüssel: ${key}`);
  }
}
