/**
 * Filter für Kundeneingaben, bevor sie an die KI gehen (Entwicklungsplan M5):
 * Namen echter Künstler und Formulierungen wie „im Stil von …“ werden entfernt, damit kein
 * fremder Stil oder Songtext nachgeahmt wird (Urheber- und Persönlichkeitsrechte).
 *
 * Bewusst einfach gehalten: Die KI erhält zusätzlich die Regel, keine echten Künstler und keine
 * bestehenden Liedzeilen zu verwenden. Die Liste lässt sich später im Admin pflegen.
 */

const KNOWN_ARTISTS = [
  "Helene Fischer",
  "Andrea Berg",
  "Roland Kaiser",
  "Wolfgang Petry",
  "Udo Lindenberg",
  "Udo Jürgens",
  "Herbert Grönemeyer",
  "Peter Maffay",
  "Nena",
  "Rammstein",
  "Die Toten Hosen",
  "Die Ärzte",
  "Mark Forster",
  "Lea",
  "Max Giesinger",
  "Sarah Connor",
  "Vanessa Mai",
  "Beatrice Egli",
  "Ed Sheeran",
  "Taylor Swift",
  "Adele",
  "Beyoncé",
  "Eminem",
  "Drake",
  "Coldplay",
  "Queen",
  "The Beatles",
  "Elvis Presley",
  "ABBA",
];

const REMOVED = "[entfernt]";

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ARTIST_PATTERN = new RegExp(`\\b(${KNOWN_ARTISTS.map(escape).join("|")})\\b`, "giu");
/** „im Stil von X“, „wie von X“, „klingt wie X“, „ähnlich wie X“ – bis zum Satzende. */
const STYLE_PATTERN =
  /\b(im stil von|im stile von|klingt wie|ähnlich wie|so wie das lied|wie das lied von|nach dem lied)\b[^.!?\n]*/giu;

export type FilterResult = { text: string; flagged: boolean };

export function filterInput(text: string): FilterResult {
  let flagged = false;
  const cleaned = text
    .replace(STYLE_PATTERN, () => {
      flagged = true;
      return REMOVED;
    })
    .replace(ARTIST_PATTERN, () => {
      flagged = true;
      return REMOVED;
    });
  return { text: cleaned, flagged };
}
