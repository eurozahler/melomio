import type { LocalizedText, QuestionCondition } from "./schema";

/**
 * Beispieldaten für die erste Version (ENTWICKLUNGSPLAN M2):
 * 3 Anlässe mit Fragen, 6 Genres, 4 Stimmungen, 4 Stimmen, ein Preis, Standardvideo.
 * `promptHint` geht später an die Musik-KI und ist deshalb auf Englisch.
 */

type SeedQuestion = {
  key: string;
  type: "text" | "textarea" | "single_choice" | "multi_choice" | "date";
  label: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  condition?: QuestionCondition;
  options?: Array<[value: string, label: string]>;
};

type SeedOccasion = { slug: string; name: string; description: string; questions: SeedQuestion[] };

const de = (text: string): LocalizedText => ({ de: text });
export { de };

const JA_NEIN: Array<[string, string]> = [
  ["ja", "Ja"],
  ["nein", "Nein"],
];

export const SEED_OCCASIONS: SeedOccasion[] = [
  {
    slug: "geburtstag",
    name: "Geburtstag",
    description: "Ein Song, der zeigt, wie besonders das Geburtstagskind ist.",
    questions: [
      {
        key: "recipient_name",
        type: "text",
        label: "Für wen ist der Song?",
        placeholder: "Vorname",
        required: true,
        maxLength: 60,
      },
      {
        key: "relationship",
        type: "single_choice",
        label: "Wer ist diese Person für dich?",
        required: true,
        options: [
          ["partner", "Partner/in"],
          ["familie", "Familie"],
          ["freund", "Freund/in"],
          ["kollege", "Kollege/Kollegin"],
          ["anderes", "Jemand anderes"],
        ],
      },
      {
        key: "round_birthday",
        type: "single_choice",
        label: "Ist es ein runder Geburtstag?",
        required: true,
        options: JA_NEIN,
      },
      {
        key: "age",
        type: "text",
        label: "Welcher Geburtstag wird gefeiert?",
        placeholder: "z. B. 50",
        maxLength: 3,
        condition: { questionKey: "round_birthday", anyOf: ["ja"] },
      },
      {
        key: "traits",
        type: "textarea",
        label: "Was macht diese Person besonders?",
        help: "Eigenschaften, Hobbys, Macken – alles, was sie ausmacht. Du kannst auch diktieren.",
        required: true,
        maxLength: 1000,
      },
      {
        key: "memories",
        type: "textarea",
        label: "Gibt es gemeinsame Erinnerungen oder Insider?",
        maxLength: 1000,
      },
      {
        key: "sender",
        type: "text",
        label: "Von wem kommt der Song?",
        placeholder: "z. B. Deine Anna",
        maxLength: 60,
      },
    ],
  },
  {
    slug: "liebe",
    name: "Liebe",
    description: "Für den Menschen, den du liebst – zum Jahrestag, zum Antrag oder einfach so.",
    questions: [
      {
        key: "partner_name",
        type: "text",
        label: "Wie heißt dein Schatz?",
        placeholder: "Vorname",
        required: true,
        maxLength: 60,
      },
      {
        key: "occasion_type",
        type: "single_choice",
        label: "Zu welchem Anlass?",
        required: true,
        options: [
          ["jahrestag", "Jahrestag"],
          ["valentinstag", "Valentinstag"],
          ["heiratsantrag", "Heiratsantrag"],
          ["einfach_so", "Einfach so"],
        ],
      },
      {
        key: "proposal_question",
        type: "single_choice",
        label: "Soll der Song mit der Frage „Willst du mich heiraten?“ enden?",
        options: JA_NEIN,
        condition: { questionKey: "occasion_type", anyOf: ["heiratsantrag"] },
      },
      {
        key: "duration",
        type: "single_choice",
        label: "Wie lange seid ihr schon zusammen?",
        options: [
          ["unter_1", "Weniger als 1 Jahr"],
          ["1_5", "1 bis 5 Jahre"],
          ["5_10", "5 bis 10 Jahre"],
          ["ueber_10", "Mehr als 10 Jahre"],
        ],
      },
      { key: "how_met", type: "textarea", label: "Wie habt ihr euch kennengelernt?", maxLength: 1000 },
      {
        key: "special_moments",
        type: "textarea",
        label: "Was liebst du an dieser Person, welche Momente sind euch wichtig?",
        help: "Je persönlicher, desto schöner wird der Song. Du kannst auch diktieren.",
        required: true,
        maxLength: 1000,
      },
      { key: "nicknames", type: "text", label: "Habt ihr Kosenamen füreinander?", maxLength: 80 },
    ],
  },
  {
    slug: "hochzeit",
    name: "Hochzeit",
    description: "Ein Song für den schönsten Tag – als Geschenk oder für den Hochzeitstanz.",
    questions: [
      {
        key: "couple_names",
        type: "text",
        label: "Wie heißt das Brautpaar?",
        placeholder: "z. B. Lena & Tom",
        required: true,
        maxLength: 80,
      },
      {
        key: "your_role",
        type: "single_choice",
        label: "Wer bist du?",
        required: true,
        options: [
          ["brautpaar", "Ich bin Teil des Brautpaars"],
          ["trauzeuge", "Trauzeuge/Trauzeugin"],
          ["familie", "Familie"],
          ["freunde", "Freunde"],
        ],
      },
      {
        key: "first_dance",
        type: "single_choice",
        label: "Soll der Song für den Hochzeitstanz sein?",
        options: JA_NEIN,
        condition: { questionKey: "your_role", anyOf: ["brautpaar"] },
      },
      { key: "wedding_date", type: "date", label: "Wann ist die Hochzeit?" },
      {
        key: "story",
        type: "textarea",
        label: "Erzähl uns die Geschichte des Paares.",
        help: "Kennenlernen, Antrag, besondere Erlebnisse. Du kannst auch diktieren.",
        required: true,
        maxLength: 1000,
      },
      { key: "wishes", type: "textarea", label: "Was wünschst du dem Paar?", maxLength: 600 },
    ],
  },
];

export const SEED_GENRES: Array<[slug: string, name: string, promptHint: string]> = [
  ["pop", "Pop", "modern German pop, catchy chorus, polished production"],
  ["schlager", "Schlager", "German Schlager, upbeat, sing-along chorus, accordion and synth accents"],
  ["deutschrock", "Deutschrock", "German rock, electric guitars, driving drums, anthemic chorus"],
  ["ballade", "Ballade", "emotional piano ballad, strings, slow tempo"],
  ["rap", "Rap", "German hip-hop, rhythmic rap verses, melodic hook, modern beat"],
  ["akustik", "Akustik", "acoustic singer-songwriter, guitar, intimate and warm"],
];

export const SEED_MOODS: Array<[string, string, string]> = [
  ["froehlich", "Fröhlich", "joyful, upbeat, celebratory"],
  ["romantisch", "Romantisch", "romantic, tender, warm"],
  ["beruehrend", "Berührend", "emotional, heartfelt, moving"],
  ["witzig", "Witzig", "humorous, playful, light-hearted"],
];

/** Stimmen sind Beschreibungen, keine Garantie (W7). */
export const SEED_VOICES: Array<[string, string, string]> = [
  ["maennlich_warm", "Warme Männerstimme", "warm male vocals"],
  ["maennlich_rau", "Raue Männerstimme", "raspy male vocals"],
  ["weiblich_kraftvoll", "Kraftvolle Frauenstimme", "powerful female vocals"],
  ["weiblich_sanft", "Sanfte Frauenstimme", "soft female vocals"],
];

export const SEED_TAX_RATE = { slug: "de_standard", country: "DE", rateBp: 1900, name: "MwSt. 19 %" };

/** Vorläufiger Preis, im Admin änderbar (E13). */
export const SEED_PRODUCT = { slug: "song", name: "Persönlicher Song mit Video", grossCents: 999 };

export const SEED_VIDEO_TEMPLATE = {
  slug: "standard_gradient",
  name: "Standard: Farbverlauf mit Titel",
  config: {
    background: "gradient",
    colors: ["#9b2fb4", "#7c3aed"],
    showTitle: true,
    width: 1080,
    height: 1920,
  },
};
