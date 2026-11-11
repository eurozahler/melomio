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

type SeedOccasion = {
  slug: string;
  name: string;
  description: string;
  questions: SeedQuestion[];
  /** Standard: sichtbar. Trauer startet ausgeblendet (Admin schaltet ein). */
  active?: boolean;
  videoTemplate?: "memorial";
};

const de = (text: string): LocalizedText => ({ de: text });
export { de };

const JA_NEIN: Array<[string, string]> = [
  ["ja", "Ja"],
  ["nein", "Nein"],
];

/** Bausteine, die in vielen Fragebögen gleich sind. */
const recipient = (label: string, placeholder = "Vorname", maxLength = 60): SeedQuestion => ({
  key: "recipient_name",
  type: "text",
  label,
  placeholder,
  required: true,
  maxLength,
});
const sender = (placeholder = "z. B. Deine Anna"): SeedQuestion => ({
  key: "sender",
  type: "text",
  label: "Von wem kommt der Song?",
  placeholder,
  maxLength: 80,
});
const DICTATE = "Du kannst auch diktieren.";
const ROLE_FAMILY: Array<[string, string]> = [
  ["eltern", "Mama/Papa"],
  ["grosseltern", "Oma/Opa"],
  ["pate", "Patin/Pate"],
  ["familie", "Andere Familie"],
  ["anderes", "Jemand anderes"],
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
  {
    slug: "trauer",
    name: "Abschied",
    description: "Ein Abschiedslied mit Video – zur Erinnerung an einen geliebten Menschen.",
    active: false,
    videoTemplate: "memorial",
    questions: [
      {
        key: "deceased_name",
        type: "text",
        label: "An wen möchtest du erinnern?",
        placeholder: "Vor- und Nachname",
        required: true,
        maxLength: 80,
      },
      {
        key: "relationship",
        type: "single_choice",
        label: "Wer war diese Person für dich?",
        required: true,
        options: [
          ["eltern", "Mutter/Vater"],
          ["grosseltern", "Oma/Opa"],
          ["partner", "Partner/in"],
          ["kind", "Kind"],
          ["geschwister", "Bruder/Schwester"],
          ["freund", "Freund/in"],
          ["anderes", "Jemand anderes"],
        ],
      },
      { key: "born", type: "date", label: "Geburtsdatum", help: "Erscheint im Video (optional)." },
      { key: "died", type: "date", label: "Sterbedatum", required: true },
      {
        key: "saying",
        type: "text",
        label: "Ein Spruch für das Video",
        placeholder: "z. B. Du bist nicht mehr da, wo du warst, aber überall, wo wir sind.",
        help: "Erscheint im Video. Ohne Angabe: „In liebevoller Erinnerung“.",
        maxLength: 120,
      },
      {
        key: "memories",
        type: "textarea",
        label: "Woran erinnerst du dich besonders gern?",
        help: "Erlebnisse, Eigenheiten, typische Sätze. Du kannst auch diktieren.",
        required: true,
        maxLength: 1200,
      },
      { key: "message", type: "textarea", label: "Was möchtest du ihr/ihm noch sagen?", maxLength: 600 },
    ],
  },
  // --- Ab hier: Anlässe vom 11.11.2026 (gemeinsam festgelegt) ---------------------------
  {
    slug: "muttertag",
    name: "Muttertag",
    description: "Danke, Mama – ein Song, der sagt, was im Alltag oft untergeht.",
    questions: [
      recipient("Wie heißt deine Mama – oder wie nennst du sie?", "z. B. Mama, Mutti, Petra"),
      {
        key: "from_whom",
        type: "single_choice",
        label: "Von wem kommt der Song?",
        required: true,
        options: [
          ["kind", "Von einem Kind"],
          ["kinder", "Von mehreren Kindern"],
          ["partner", "Vom Partner (im Namen der Kinder)"],
          ["enkel", "Von den Enkeln"],
        ],
      },
      {
        key: "traits",
        type: "textarea",
        label: "Was macht deine Mama besonders?",
        help: `Eigenschaften, typische Sätze, was sie für dich tut. ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      { key: "memories", type: "textarea", label: "Welche Erinnerung an sie trägst du im Herzen?", maxLength: 1000 },
      { key: "thanks", type: "textarea", label: "Wofür möchtest du dich besonders bedanken?", maxLength: 600 },
      sender("z. B. Deine Lisa und Tom"),
    ],
  },
  {
    slug: "vatertag",
    name: "Vatertag",
    description: "Für den besten Papa – ein Song mit euren Geschichten.",
    questions: [
      recipient("Wie heißt dein Papa – oder wie nennst du ihn?", "z. B. Papa, Paps, Michael"),
      {
        key: "from_whom",
        type: "single_choice",
        label: "Von wem kommt der Song?",
        required: true,
        options: [
          ["kind", "Von einem Kind"],
          ["kinder", "Von mehreren Kindern"],
          ["partner", "Von der Partnerin (im Namen der Kinder)"],
          ["enkel", "Von den Enkeln"],
        ],
      },
      {
        key: "traits",
        type: "textarea",
        label: "Was macht deinen Papa aus?",
        help: `Sprüche, Hobbys, Macken, was er dir beigebracht hat. ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      { key: "memories", type: "textarea", label: "Welche gemeinsamen Erlebnisse sollen vorkommen?", maxLength: 1000 },
      { key: "thanks", type: "textarea", label: "Wofür möchtest du dich besonders bedanken?", maxLength: 600 },
      sender("z. B. Deine Lena"),
    ],
  },
  {
    slug: "baby",
    name: "Geburt & Baby",
    description: "Willkommen auf der Welt – ein Song für den kleinen neuen Menschen.",
    questions: [
      recipient("Wie heißt das Baby?"),
      {
        key: "birth_date",
        type: "date",
        label: "Wann ist das Baby geboren?",
        help: "Oder der errechnete Termin (optional).",
      },
      { key: "your_role", type: "single_choice", label: "Wer bist du?", required: true, options: ROLE_FAMILY },
      {
        key: "song_kind",
        type: "single_choice",
        label: "Was für ein Song soll es werden?",
        required: true,
        options: [
          ["schlaflied", "Sanftes Schlaflied"],
          ["willkommen", "Fröhlicher Willkommenssong"],
        ],
      },
      {
        key: "family",
        type: "textarea",
        label: "Erzähl uns von der Familie.",
        help: `Namen von Eltern und Geschwistern, wie die Zeit des Wartens war, worauf ihr euch freut. ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      { key: "wishes", type: "textarea", label: "Was wünschst du dem Kind für sein Leben?", maxLength: 600 },
      sender("z. B. Oma Rita und Opa Klaus"),
    ],
  },
  {
    slug: "grosseltern",
    name: "Oma & Opa",
    description: "Ein Song für die Menschen, die immer da waren.",
    questions: [
      recipient("Für wen ist der Song?", "z. B. Oma Gerda, Opa Heinz oder Oma & Opa", 80),
      {
        key: "who",
        type: "single_choice",
        label: "Für wen genau?",
        required: true,
        options: [
          ["oma", "Für Oma"],
          ["opa", "Für Opa"],
          ["beide", "Für beide"],
        ],
      },
      {
        key: "reason",
        type: "single_choice",
        label: "Gibt es einen Anlass?",
        required: true,
        options: [
          ["geburtstag", "Geburtstag"],
          ["hochzeitstag", "Hochzeitstag"],
          ["weihnachten", "Weihnachten"],
          ["einfach", "Einfach so / Danke"],
        ],
      },
      {
        key: "traits",
        type: "textarea",
        label: "Was macht sie so besonders?",
        help: `Eigenarten, Lieblingssprüche, was sie für die Familie tun. ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      {
        key: "memories",
        type: "textarea",
        label: "Welche Erinnerungen verbindest du mit ihnen?",
        help: "Ferien bei Oma, Opas Werkstatt, das Lieblingsessen …",
        maxLength: 1000,
      },
      sender("z. B. Eure Enkel Mia und Ben"),
    ],
  },
  {
    slug: "weihnachten",
    name: "Weihnachten",
    description: "Das persönlichste Geschenk unterm Baum.",
    questions: [
      recipient("Für wen ist der Song?", "Name oder z. B. „die ganze Familie“", 80),
      {
        key: "relationship",
        type: "single_choice",
        label: "Wer ist das für dich?",
        required: true,
        options: [
          ["partner", "Partner/in"],
          ["familie", "Familie / Eltern"],
          ["kinder", "Kinder"],
          ["freund", "Freund/in"],
          ["team", "Team / Kollegen"],
        ],
      },
      {
        key: "tone",
        type: "single_choice",
        label: "Wie soll der Song wirken?",
        required: true,
        options: [
          ["besinnlich", "Besinnlich und warm"],
          ["festlich", "Fröhlich und festlich"],
          ["lustig", "Lustig mit Augenzwinkern"],
        ],
      },
      {
        key: "year",
        type: "textarea",
        label: "Was war dieses Jahr besonders?",
        help: `Schöne Momente, Veränderungen, gemeinsame Erlebnisse. ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      {
        key: "traditions",
        type: "textarea",
        label: "Wie feiert ihr Weihnachten?",
        help: "Traditionen, Plätzchen, der schiefe Baum, wer immer zu spät kommt …",
        maxLength: 800,
      },
      { key: "wishes", type: "textarea", label: "Was wünschst du für das neue Jahr?", maxLength: 600 },
      sender(),
    ],
  },
  {
    slug: "jubilaeum",
    name: "Hochzeitstag & Jubiläum",
    description: "Silberhochzeit, Goldene Hochzeit oder Jahrestag – ein Song über eure gemeinsamen Jahre.",
    questions: [
      recipient("Wie heißt das Paar?", "z. B. Maria & Klaus", 80),
      {
        key: "anniversary",
        type: "single_choice",
        label: "Welches Jubiläum wird gefeiert?",
        required: true,
        options: [
          ["jahrestag", "Hochzeitstag / Jahrestag"],
          ["silber", "Silberne Hochzeit (25 Jahre)"],
          ["rubin", "Rubinhochzeit (40 Jahre)"],
          ["gold", "Goldene Hochzeit (50 Jahre)"],
          ["diamant", "Diamantene Hochzeit (60 Jahre)"],
          ["anderes", "Ein anderes Jubiläum"],
        ],
      },
      {
        key: "your_role",
        type: "single_choice",
        label: "Wer bist du?",
        required: true,
        options: [
          ["partner", "Ich bin Teil des Paares"],
          ["kind", "Tochter/Sohn"],
          ["enkel", "Enkel/in"],
          ["freund", "Freund/in"],
          ["anderes", "Jemand anderes"],
        ],
      },
      {
        key: "story",
        type: "textarea",
        label: "Erzähl uns die Geschichte des Paares.",
        help: `Kennenlernen, Hochzeit, Kinder, Umzüge – und was die beiden zusammenhält. ${DICTATE}`,
        required: true,
        maxLength: 1200,
      },
      { key: "moments", type: "textarea", label: "Welche gemeinsamen Momente sollen vorkommen?", maxLength: 800 },
      sender("z. B. Eure Kinder und Enkel"),
    ],
  },
  {
    slug: "ruhestand",
    name: "Ruhestand & Abschied im Job",
    description: "Für Kolleginnen und Kollegen, die in Rente gehen oder neue Wege gehen.",
    questions: [
      recipient("Für wen ist der Song?"),
      {
        key: "reason",
        type: "single_choice",
        label: "Was ist der Anlass?",
        required: true,
        options: [
          ["rente", "Ruhestand / Rente"],
          ["wechsel", "Jobwechsel / Abschied aus dem Team"],
          ["firmenjubilaeum", "Firmenjubiläum"],
        ],
      },
      { key: "years", type: "text", label: "Wie lange war sie/er dabei?", placeholder: "z. B. 32 Jahre", maxLength: 40 },
      {
        key: "job",
        type: "textarea",
        label: "Was hat sie/er gemacht – und was macht sie/ihn im Team aus?",
        help: `Aufgaben, Eigenheiten, wofür alle dankbar sind. ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      {
        key: "anecdotes",
        type: "textarea",
        label: "Gibt es Anekdoten, Sprüche oder Running Gags?",
        maxLength: 800,
      },
      {
        key: "plans",
        type: "textarea",
        label: "Was hat sie/er jetzt vor?",
        help: "Reisen, Enkel, Garten, Wohnmobil …",
        maxLength: 600,
      },
      sender("z. B. Dein Team aus der Buchhaltung"),
    ],
  },
  {
    slug: "abschluss",
    name: "Abschluss",
    description: "Abi, Ausbildung oder Studium geschafft – ein Song zum Feiern.",
    questions: [
      recipient("Wer hat den Abschluss geschafft?"),
      {
        key: "degree",
        type: "single_choice",
        label: "Welcher Abschluss?",
        required: true,
        options: [
          ["abitur", "Abitur"],
          ["schule", "Schulabschluss"],
          ["ausbildung", "Ausbildung"],
          ["studium", "Studium"],
          ["anderes", "Etwas anderes"],
        ],
      },
      {
        key: "relationship",
        type: "single_choice",
        label: "Wer bist du?",
        required: true,
        options: [
          ["eltern", "Mama/Papa"],
          ["familie", "Andere Familie"],
          ["partner", "Partner/in"],
          ["freund", "Freund/in"],
          ["anderes", "Jemand anderes"],
        ],
      },
      {
        key: "journey",
        type: "textarea",
        label: "Wie war der Weg dorthin?",
        help: `Lernnächte, Hürden, Erfolge, Lieblingsfach, Klassenfahrt … ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      { key: "traits", type: "textarea", label: "Was macht sie/ihn besonders?", maxLength: 800 },
      { key: "future", type: "textarea", label: "Wie geht es weiter – und was wünschst du ihr/ihm?", maxLength: 600 },
      sender(),
    ],
  },
  {
    slug: "taufe",
    name: "Taufe",
    description: "Ein Song zur Taufe – für Täufling, Eltern und Paten.",
    questions: [
      recipient("Wie heißt der Täufling?"),
      { key: "your_role", type: "single_choice", label: "Wer bist du?", required: true, options: ROLE_FAMILY },
      { key: "date", type: "date", label: "Wann ist die Taufe?" },
      {
        key: "verse",
        type: "text",
        label: "Gibt es einen Taufspruch?",
        help: "Wird gern in den Song eingebunden (optional).",
        maxLength: 200,
      },
      {
        key: "family",
        type: "textarea",
        label: "Erzähl uns vom Kind und von der Familie.",
        help: `Namen, Eigenheiten, was ihr euch für das Kind wünscht. ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      { key: "wishes", type: "textarea", label: "Was möchtest du dem Kind mit auf den Weg geben?", maxLength: 600 },
      sender("z. B. Deine Patentante Julia"),
    ],
  },
  {
    slug: "kommunion",
    name: "Kommunion & Konfirmation",
    description: "Ein Song für das große Fest – Kommunion, Konfirmation, Firmung oder Jugendweihe.",
    questions: [
      recipient("Für wen ist der Song?"),
      {
        key: "celebration",
        type: "single_choice",
        label: "Welches Fest?",
        required: true,
        options: [
          ["kommunion", "Erstkommunion"],
          ["konfirmation", "Konfirmation"],
          ["firmung", "Firmung"],
          ["jugendweihe", "Jugendweihe"],
        ],
      },
      { key: "your_role", type: "single_choice", label: "Wer bist du?", required: true, options: ROLE_FAMILY },
      {
        key: "traits",
        type: "textarea",
        label: "Was macht sie/ihn aus?",
        help: `Hobbys, Freunde, Lieblingssachen, was sie/ihn begeistert. ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      { key: "memories", type: "textarea", label: "Gibt es besondere Erlebnisse oder Insider?", maxLength: 800 },
      { key: "wishes", type: "textarea", label: "Was wünschst du ihr/ihm für den weiteren Weg?", maxLength: 600 },
      sender(),
    ],
  },
  {
    slug: "einschulung",
    name: "Einschulung",
    description: "Der erste Schultag – ein Mutmach-Song für Schulkinder.",
    questions: [
      recipient("Wie heißt das Schulkind?"),
      { key: "your_role", type: "single_choice", label: "Wer bist du?", required: true, options: ROLE_FAMILY },
      { key: "school", type: "text", label: "Wie heißt die Schule oder Klasse?", help: "Optional.", maxLength: 80 },
      {
        key: "favorites",
        type: "textarea",
        label: "Was liebt das Kind?",
        help: `Lieblingstier, Hobbys, Spielsachen, beste Freunde … ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      {
        key: "looking_forward",
        type: "textarea",
        label: "Worauf freut es sich – und wovor hat es vielleicht ein bisschen Bammel?",
        maxLength: 600,
      },
      sender("z. B. Mama und Papa"),
    ],
  },
  {
    slug: "kindergeburtstag",
    name: "Kindergeburtstag",
    description: "Ein Song zum Mitsingen für die Geburtstagsparty.",
    questions: [
      recipient("Wie heißt das Geburtstagskind?"),
      { key: "age", type: "text", label: "Wie alt wird es?", placeholder: "z. B. 6", required: true, maxLength: 2 },
      {
        key: "favorites",
        type: "textarea",
        label: "Was liebt das Kind?",
        help: `Lieblingstier, Superheld, Hobby, Lieblingsessen … ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      {
        key: "friends",
        type: "text",
        label: "Wer feiert mit?",
        help: "Namen von Geschwistern oder Freunden (optional).",
        maxLength: 200,
      },
      { key: "funny", type: "textarea", label: "Gibt es lustige Geschichten oder Sprüche?", maxLength: 800 },
      sender("z. B. Mama, Papa und Paul"),
    ],
  },
  {
    slug: "freundschaft",
    name: "Freundschaft & Danke",
    description: "Für die beste Freundin, den besten Freund – oder einfach, um Danke zu sagen.",
    questions: [
      recipient("Für wen ist der Song?"),
      {
        key: "reason",
        type: "single_choice",
        label: "Was möchtest du sagen?",
        required: true,
        options: [
          ["freundschaft", "Danke, dass es dich gibt"],
          ["danke", "Danke für etwas Bestimmtes"],
          ["abschied", "Bis bald (Umzug, Auslandsjahr …)"],
        ],
      },
      { key: "since", type: "text", label: "Seit wann kennt ihr euch?", placeholder: "z. B. seit der 5. Klasse", maxLength: 80 },
      {
        key: "story",
        type: "textarea",
        label: "Was macht eure Freundschaft aus?",
        help: `Wie ihr euch kennengelernt habt, was ihr zusammen durchgestanden habt. ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      { key: "memories", type: "textarea", label: "Welche Erlebnisse und Insider sollen vorkommen?", maxLength: 1000 },
      sender(),
    ],
  },
  {
    slug: "junggesellenabschied",
    name: "Junggesellenabschied",
    description: "Der Party-Song für den JGA – lustig und zum Mitgrölen.",
    questions: [
      recipient("Wie heißt die Braut oder der Bräutigam?"),
      { key: "fiance_name", type: "text", label: "Wie heißt der/die Zukünftige?", maxLength: 60 },
      {
        key: "style",
        type: "single_choice",
        label: "Wie frech darf es sein?",
        required: true,
        options: [
          ["lieb", "Lieb und herzlich"],
          ["frech", "Frech, aber jugendfrei"],
        ],
      },
      {
        key: "stories",
        type: "textarea",
        label: "Lustige Geschichten, Macken und Insider?",
        help: `Nur, was die Person verträgt – der Song soll Spaß machen, nicht bloßstellen. ${DICTATE}`,
        required: true,
        maxLength: 1200,
      },
      { key: "crew", type: "text", label: "Wer feiert mit?", help: "Name der Truppe oder Namen (optional).", maxLength: 200 },
      sender("z. B. Deine Mädels"),
    ],
  },
  {
    slug: "haustier",
    name: "Haustier",
    description: "Ein Song über deinen Hund, deine Katze oder dein Pferd.",
    questions: [
      recipient("Wie heißt dein Tier?", "z. B. Bello"),
      {
        key: "animal",
        type: "single_choice",
        label: "Was für ein Tier?",
        required: true,
        options: [
          ["hund", "Hund"],
          ["katze", "Katze"],
          ["pferd", "Pferd"],
          ["kleintier", "Kleintier"],
          ["anderes", "Ein anderes Tier"],
        ],
      },
      {
        key: "reason",
        type: "single_choice",
        label: "Gibt es einen Anlass?",
        required: true,
        options: [
          ["einfach", "Einfach so"],
          ["geburtstag", "Geburtstag / Einzugstag"],
          ["erinnerung", "Zur Erinnerung (Regenbogenbrücke)"],
        ],
      },
      {
        key: "traits",
        type: "textarea",
        label: "Was macht dein Tier so besonders?",
        help: `Eigenarten, Lieblingsplatz, Lieblingsfutter, Tricks … ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      { key: "stories", type: "textarea", label: "Gibt es lustige oder rührende Geschichten?", maxLength: 1000 },
      sender("z. B. Dein Frauchen Sarah"),
    ],
  },
  {
    slug: "mutmacher",
    name: "Gute Besserung & Mutmacher",
    description: "Kraft, Trost und Zuversicht für schwere Zeiten.",
    questions: [
      recipient("Für wen ist der Song?"),
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
        key: "situation",
        type: "single_choice",
        label: "Worum geht es?",
        help: "Bitte keine Diagnosen oder Details zur Gesundheit angeben.",
        required: true,
        options: [
          ["besserung", "Gute Besserung"],
          ["herausforderung", "Eine große Herausforderung (Prüfung, Neuanfang …)"],
          ["kummer", "Liebeskummer / Trennung"],
          ["anderes", "Eine andere schwere Zeit"],
        ],
      },
      {
        key: "strengths",
        type: "textarea",
        label: "Was zeichnet sie/ihn aus – was gibt ihr/ihm Kraft?",
        help: `Stärken, Menschen, Dinge, die ihr/ihm wichtig sind. ${DICTATE}`,
        required: true,
        maxLength: 1000,
      },
      { key: "together", type: "textarea", label: "Worauf freut ihr euch, wenn alles überstanden ist?", maxLength: 800 },
      { key: "message", type: "textarea", label: "Was möchtest du ihr/ihm sagen?", maxLength: 600 },
      sender(),
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
