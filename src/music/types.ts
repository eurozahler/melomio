import type { MusicSection, TimedLine } from "@/db/schema";
import type { Lyrics } from "@/lyrics/types";

/**
 * Austauschbare Schnittstelle für Musik-KI (docs/ARCHITEKTUR.md, Abschnitt 3).
 * Anbieter, die mit Auftragsnummer und Abfragen arbeiten, erledigen das Warten intern;
 * der Worker sieht immer dasselbe Muster: generate() liefert eine fertige Audiodatei.
 */

export type MusicInput = {
  lyrics: Lyrics;
  genreHint: string | null;
  moodHint: string | null;
  voiceHint: string | null;
  language: "de";
  targetDurationS: number;
};

export type MusicResult = {
  /** Pfad der heruntergeladenen bzw. erzeugten Datei im Arbeitsordner. */
  file: string;
  format: "mp3";
  /** Abschnittszeiten (Strophe, Refrain …), falls der Anbieter sie liefert (F-19). */
  sections: MusicSection[] | null;
  /** Gesungene Zeilen mit Zeitstempeln (für den Songtext im Video), falls verfügbar. */
  lines?: TimedLine[] | null;
  providerJobId: string | null;
  model: string;
};

export interface MusicProvider {
  readonly name: string;
  /** Geschätzte Kosten in Cent für einen Kandidaten (für Tagesbudget und Auswertung). */
  estimateCostCents(input: MusicInput): number;
  generate(input: MusicInput, workDir: string): Promise<MusicResult>;
  /** Restguthaben beim Anbieter in (US-)Cent, falls abfragbar – für den Guthaben-Alarm. */
  getBalanceCents?(): Promise<number | null>;
}
