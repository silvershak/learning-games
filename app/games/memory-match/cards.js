/**
 * cards.js — pure face registry for memory-match (no DOM access anywhere in
 * this file): board sizes, the card-type registry (a curated 128-glyph emoji
 * pool, a generated 128-face color/shape pool, and one themed type per emoji
 * family), the family round-robin sampler, and buildDeck().
 *
 * A type is `{ id, labelKey, icon, faces() }`; `faces()` returns a fresh
 * `Face[]`. A Face is a render descriptor, not markup:
 * `{ key, kind: "emoji" | "shape", family, glyph?, shape?, hue?, fill?, name?: { he, en } }`.
 * game.js renders a face purely from `kind`, never from the type id, so a
 * future type reusing `kind: "shape"` needs zero renderer changes.
 */

import { shuffle } from "../../shared/js/util.js";

/**
 * @typedef {Object} Face
 * @property {string} key - Unique within its type; a card's faceKey.
 * @property {"emoji"|"shape"} kind
 * @property {string} family - Round-robin grouping key (an emoji category, or a hue for `colors`).
 * @property {string} [glyph] - For kind "emoji".
 * @property {string} [shape] - For kind "shape": a key into SHAPE_PATHS.
 * @property {string} [hue] - For kind "shape": a key into HUES.
 * @property {"solid"|"outline"} [fill] - For kind "shape".
 * @property {{he: string, en: string}} [name] - For kind "emoji" (content data, not i18n — see spec Decision 3).
 */

/**
 * Board sizes: id -> grid shape + pair count. Order matches the setup screen.
 * Capped at 16 pairs (the "large" tier) so every size fits inside a single
 * emoji family's 16-glyph pool as well as the full mixed/colors pools — no
 * type x size combination is ever short on faces (spec Decision 2). Columns
 * are fixed at 4 across all three tiers so the board is always narrow enough
 * to fit a phone's width without scrolling; only the row count (difficulty)
 * grows.
 */
export const SIZES = [
  { id: "small", cols: 4, rows: 4, pairs: 8 },
  { id: "medium", cols: 4, rows: 6, pairs: 12 },
  { id: "large", cols: 4, rows: 8, pairs: 16 },
];

/**
 * Looks up a board size by id, falling back to the gentlest size (small) for
 * an unknown/missing id — callers that need strict validation should check
 * `SIZES.some(...)` themselves first (see game.js's storage validation).
 * @param {string} id
 * @returns {{id: string, cols: number, rows: number, pairs: number}}
 */
export function getSize(id) {
  return SIZES.find((size) => size.id === id) ?? SIZES[0];
}

/**
 * The 128-glyph emoji pool, 8 families x 16, exactly as specified: chosen for
 * kid-familiarity and for staying distinguishable at a 44px cell. Each glyph
 * carries its own he/en name (content data — see spec Decision 3), looked up
 * by the current language in game.js's faceLabel().
 */
const EMOJI_FAMILIES = [
  {
    id: "animals",
    items: [
      ["🐶", "כלב", "dog"],
      ["🐱", "חתול", "cat"],
      ["🐭", "עכבר", "mouse"],
      ["🐹", "אוגר", "hamster"],
      ["🐰", "ארנב", "rabbit"],
      ["🦊", "שועל", "fox"],
      ["🐻", "דוב", "bear"],
      ["🐼", "פנדה", "panda"],
      ["🐨", "קואלה", "koala"],
      ["🐯", "נמר", "tiger"],
      ["🦁", "אריה", "lion"],
      ["🐮", "פרה", "cow"],
      ["🐷", "חזיר", "pig"],
      ["🐸", "צפרדע", "frog"],
      ["🐵", "קוף", "monkey"],
      ["🐔", "תרנגולת", "chicken"],
    ],
  },
  {
    id: "sea",
    items: [
      ["🐧", "פינגווין", "penguin"],
      ["🦅", "עיט", "eagle"],
      ["🦆", "ברווז", "duck"],
      ["🦉", "ינשוף", "owl"],
      ["🦜", "תוכי", "parrot"],
      ["🐢", "צב", "turtle"],
      ["🐍", "נחש", "snake"],
      ["🐙", "תמנון", "octopus"],
      ["🦑", "דיונון", "squid"],
      ["🦀", "סרטן", "crab"],
      ["🐬", "דולפין", "dolphin"],
      ["🐳", "לוויתן", "whale"],
      ["🐟", "דג", "fish"],
      ["🐠", "דג צבעוני", "tropical fish"],
      ["🦈", "כריש", "shark"],
      ["🦐", "שרימפס", "shrimp"],
    ],
  },
  {
    id: "garden",
    items: [
      ["🐝", "דבורה", "bee"],
      ["🐛", "זחל", "caterpillar"],
      ["🦋", "פרפר", "butterfly"],
      ["🐌", "חילזון", "snail"],
      ["🐞", "פרת משה רבנו", "ladybug"],
      ["🕷", "עכביש", "spider"],
      ["🌸", "פריחה", "blossom"],
      ["🌻", "חמנייה", "sunflower"],
      ["🌷", "צבעוני", "tulip"],
      ["🌹", "ורד", "rose"],
      ["🌼", "פרח", "daisy"],
      ["🍀", "תלתן", "clover"],
      ["🌲", "עץ מחט", "evergreen tree"],
      ["🌴", "דקל", "palm tree"],
      ["🌵", "קקטוס", "cactus"],
      ["🍄", "פטרייה", "mushroom"],
    ],
  },
  {
    id: "produce",
    items: [
      ["🍎", "תפוח", "apple"],
      ["🍌", "בננה", "banana"],
      ["🍇", "ענבים", "grapes"],
      ["🍓", "תות", "strawberry"],
      ["🍉", "אבטיח", "watermelon"],
      ["🍊", "תפוז", "orange"],
      ["🍋", "לימון", "lemon"],
      ["🍒", "דובדבן", "cherries"],
      ["🍑", "אפרסק", "peach"],
      ["🥝", "קיווי", "kiwi"],
      ["🥕", "גזר", "carrot"],
      ["🌽", "תירס", "corn"],
      ["🥦", "ברוקולי", "broccoli"],
      ["🍅", "עגבנייה", "tomato"],
      ["🥑", "אבוקדו", "avocado"],
      ["🍆", "חציל", "eggplant"],
    ],
  },
  {
    id: "food",
    items: [
      ["🍞", "לחם", "bread"],
      ["🧀", "גבינה", "cheese"],
      ["🍕", "פיצה", "pizza"],
      ["🍔", "המבורגר", "burger"],
      ["🌭", "נקניקייה", "hot dog"],
      ["🍟", "צ'יפס", "fries"],
      ["🥨", "בייגלה", "pretzel"],
      ["🍪", "עוגייה", "cookie"],
      ["🍩", "דונאט", "donut"],
      ["🎂", "עוגת יום הולדת", "birthday cake"],
      ["🍭", "סוכריה על מקל", "lollipop"],
      ["🍫", "שוקולד", "chocolate"],
      ["🍿", "פופקורן", "popcorn"],
      ["🥞", "פנקייק", "pancakes"],
      ["🍦", "גלידה", "ice cream"],
      ["🍯", "דבש", "honey"],
    ],
  },
  {
    id: "vehicles",
    items: [
      ["🚗", "מכונית", "car"],
      ["🚕", "מונית", "taxi"],
      ["🚌", "אוטובוס", "bus"],
      ["🚒", "מכבת אש", "fire truck"],
      ["🚑", "אמבולנס", "ambulance"],
      ["🚓", "ניידת משטרה", "police car"],
      ["🚜", "טרקטור", "tractor"],
      ["🚲", "אופניים", "bicycle"],
      ["🛵", "קטנוע", "scooter"],
      ["🚂", "קטר", "train"],
      ["🚀", "רקטה", "rocket"],
      ["✈️", "מטוס", "airplane"],
      ["🚁", "מסוק", "helicopter"],
      ["⛵", "סירת מפרש", "sailboat"],
      ["🚢", "אונייה", "ship"],
      ["🛶", "קאנו", "canoe"],
    ],
  },
  {
    id: "sky",
    items: [
      ["☀️", "שמש", "sun"],
      ["🌙", "ירח", "moon"],
      ["⭐", "כוכב", "star"],
      ["🌈", "קשת", "rainbow"],
      ["☁️", "ענן", "cloud"],
      ["⛄", "איש שלג", "snowman"],
      ["❄️", "פתית שלג", "snowflake"],
      ["🔥", "אש", "fire"],
      ["💧", "טיפה", "droplet"],
      ["🌊", "גל", "wave"],
      ["⚡", "ברק", "lightning"],
      ["🌍", "כדור הארץ", "earth"],
      ["🌋", "הר געש", "volcano"],
      ["🏔", "הר", "mountain"],
      ["🏖", "חוף ים", "beach"],
      ["🌪", "טורנדו", "tornado"],
    ],
  },
  {
    id: "objects",
    items: [
      ["⚽", "כדורגל", "soccer ball"],
      ["🏀", "כדורסל", "basketball"],
      ["🎾", "כדור טניס", "tennis ball"],
      ["🎈", "בלון", "balloon"],
      ["🎁", "מתנה", "gift"],
      ["🧸", "דובי", "teddy bear"],
      ["🎨", "פלטת צבעים", "palette"],
      ["🖍", "עפרון צבעוני", "crayon"],
      ["✏️", "עיפרון", "pencil"],
      ["📚", "ספרים", "books"],
      ["🔔", "פעמון", "bell"],
      ["🥁", "תוף", "drum"],
      ["🎸", "גיטרה", "guitar"],
      ["🎺", "חצוצרה", "trumpet"],
      ["🔑", "מפתח", "key"],
      ["⏰", "שעון מעורר", "alarm clock"],
    ],
  },
];

/**
 * Builds the 128-face emoji pool from EMOJI_FAMILIES. Fresh array each call
 * (Face objects are cheap, plain data) — callers should not mutate it.
 * @returns {Face[]}
 */
function buildEmojiFaces() {
  const faces = [];
  for (const family of EMOJI_FAMILIES) {
    for (const [glyph, he, en] of family.items) {
      faces.push({ key: glyph, kind: "emoji", family: family.id, glyph, name: { he, en } });
    }
  }
  return faces;
}

/** 8 strongly saturated hues (req. 4's table), each with a documented ≥4.5:1-safe hex. */
export const HUES = [
  { id: "red", hex: "#e23b2e" },
  { id: "orange", hex: "#ef7f18" },
  { id: "yellow", hex: "#f2c40c" },
  { id: "green", hex: "#2f9e44" },
  { id: "teal", hex: "#0d9488" },
  { id: "blue", hex: "#2b5fd9" },
  { id: "purple", hex: "#7c3aed" },
  { id: "pink", hex: "#e857a6" },
];

/** 8 shape ids — keys into SHAPE_PATHS, and into the `shape.*` i18n table. */
export const SHAPES = ["circle", "square", "triangle", "diamond", "star", "heart", "plus", "moon"];

/** The two fill treatments — keys into the `fill.*` i18n table. */
export const FILLS = ["solid", "outline"];

/**
 * One flat silhouette per shape, each a single <path> in a 100x100 viewBox,
 * centered with enough margin that a 12-unit outline stroke (see game.css's
 * `.mm-card__shape--outline`) never clips against the viewBox edge.
 * @type {Object<string, string>}
 */
export const SHAPE_PATHS = {
  circle: "M 14 50 A 36 36 0 1 1 86 50 A 36 36 0 1 1 14 50 Z",
  square: "M 18 18 H 82 V 82 H 18 Z",
  triangle: "M 50 12 L 88 88 L 12 88 Z",
  diamond: "M 50 10 L 90 50 L 50 90 L 10 50 Z",
  star: "M 50 10 L 59.4 37.06 L 88.04 37.64 L 65.22 54.94 L 73.51 82.36 L 50 66 L 26.49 82.36 L 34.78 54.94 L 11.96 37.64 L 40.59 37.06 Z",
  heart:
    "M 50 84 C 24 64 12 46 12 33 C 12 20 22 12 33 12 C 42 12 47 18 50 25 C 53 18 58 12 67 12 C 78 12 88 20 88 33 C 88 46 76 64 50 84 Z",
  plus: "M 38 14 H 62 V 38 H 86 V 62 H 62 V 86 H 38 V 62 H 14 V 38 H 38 Z",
  moon: "M 50 12 C 26 12 8 30 8 50 C 8 70 26 88 50 88 C 42 78 36 65 36 50 C 36 35 42 22 50 12 Z",
};

/**
 * Builds the 128-face `colors` pool: 8 hues x 8 shapes x 2 fills. `family` is
 * the hue, so the round-robin sampler never hands a small board all one hue.
 * No `name` field — colors faces compose their accessible name from 18
 * ordinary i18n keys instead (see game.js's faceLabel(), spec Decision 3).
 * @returns {Face[]}
 */
function buildColorFaces() {
  const faces = [];
  for (const hue of HUES) {
    for (const shape of SHAPES) {
      for (const fill of FILLS) {
        faces.push({
          key: `${hue.id}-${shape}-${fill}`,
          kind: "shape",
          family: hue.id,
          shape,
          hue: hue.id,
          fill,
        });
      }
    }
  }
  return faces;
}

/**
 * One themed type per EMOJI_FAMILIES entry (e.g. "just animals"), alongside
 * the mixed `emoji` and generated `colors` types below. Each family already
 * has exactly 16 glyphs — enough for every size up to the 16-pair "large"
 * tier — so a themed type is never short of faces either. The icon is the
 * family's own first glyph, so no separate icon curation is needed.
 * @returns {{id: string, labelKey: string, icon: string, faces: () => Face[]}[]}
 */
function buildFamilyTypes() {
  return EMOJI_FAMILIES.map((family) => ({
    id: family.id,
    labelKey: `memoryMatch.setup.type.${family.id}`,
    icon: family.items[0][0],
    faces: () => buildEmojiFaces().filter((face) => face.family === family.id),
  }));
}

/**
 * The card-type registry (spec req. 4): the mixed `emoji` pool, the
 * generated `colors` pool, and one themed type per emoji family. Adding a
 * type is one entry here plus its strings — no change to game.js or the
 * setup rendering loop, which both iterate this array.
 */
export const CARD_TYPES = [
  { id: "emoji", labelKey: "memoryMatch.setup.type.emoji", icon: "🖼", faces: buildEmojiFaces },
  { id: "colors", labelKey: "memoryMatch.setup.type.colors", icon: "🔷", faces: buildColorFaces },
  ...buildFamilyTypes(),
];

/**
 * Looks up a card type by id, falling back to the first registered type
 * (emoji) for an unknown/missing id.
 * @param {string} id
 * @returns {{id: string, labelKey: string, icon: string, faces: () => Face[]}}
 */
export function getCardType(id) {
  return CARD_TYPES.find((type) => type.id === id) ?? CARD_TYPES[0];
}

/**
 * Builds a `faceKey -> Face` lookup for a type's current pool, so game.js can
 * resolve a deck's faceKeys back to full render descriptors.
 * @param {string} typeId
 * @returns {Map<string, Face>}
 */
export function buildFaceIndex(typeId) {
  const type = getCardType(typeId);
  const map = new Map();
  for (const face of type.faces()) {
    map.set(face.key, face);
  }
  return map;
}

/**
 * Picks `count` faces from `faces` by walking the pool's families in
 * shuffled order, taking one face per family per pass, until `count` faces
 * are collected (spec req. 2). This spreads a small board across families
 * (e.g. a 4x4 board never gets eight faces that are all "roundish and
 * red-ish") while being a no-op at the full pool size (every family is
 * eventually exhausted and the whole pool is used).
 * @param {Face[]} faces
 * @param {number} count
 * @returns {Face[]} Exactly `count` distinct faces (assuming `faces` has >= count entries).
 */
function pickFacesRoundRobin(faces, count) {
  const byFamily = new Map();
  for (const face of faces) {
    if (!byFamily.has(face.family)) {
      byFamily.set(face.family, []);
    }
    byFamily.get(face.family).push(face);
  }

  const familyOrder = shuffle([...byFamily.keys()]);
  const queues = new Map(familyOrder.map((family) => [family, shuffle(byFamily.get(family))]));

  const picked = [];
  let progressed = true;
  while (picked.length < count && progressed) {
    progressed = false;
    for (const family of familyOrder) {
      if (picked.length >= count) {
        break;
      }
      const queue = queues.get(family);
      if (queue.length > 0) {
        picked.push(queue.shift());
        progressed = true;
      }
    }
  }
  return picked;
}

/**
 * Builds a full, shuffled deck for a round: pure and synchronous (32 cards
 * at most is trivial work, well under one animation frame — no loading state).
 * @param {string} sizeId - One of SIZES's ids.
 * @param {string} typeId - One of CARD_TYPES's ids.
 * @returns {{cols: number, rows: number, cards: {id: number, faceKey: string}[]}}
 */
export function buildDeck(sizeId, typeId) {
  const size = getSize(sizeId);
  const type = getCardType(typeId);
  const chosenFaces = pickFacesRoundRobin(type.faces(), size.pairs);

  const faceKeys = [];
  for (const face of chosenFaces) {
    faceKeys.push(face.key, face.key);
  }
  const shuffledKeys = shuffle(faceKeys);

  const cards = shuffledKeys.map((faceKey, index) => ({ id: index, faceKey }));
  return { cols: size.cols, rows: size.rows, cards };
}
