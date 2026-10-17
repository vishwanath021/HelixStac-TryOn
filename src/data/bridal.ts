/** Telugu bridal only: Andhra and Telangana. Other regions are not on this menu. */

export type BridalEventId = "wedding" | "engagement" | "haldi" | "mehendi" | "sangeet" | "reception";

/** Trending is the modern editorial set. Temple is the vintage Telugu set already supplied. */
export type BridalStyleId = "trending" | "temple";

export type BridalLook = {
  id: string;
  name: string;
  region: string;
  style: BridalStyleId;
  /** False skips the photo request. Hair has no file yet, so it must stay false. */
  image: boolean;
  blurb: string;
  prompt: string;
  events: BridalEventId[];
};

export type BridalMakeup = {
  id: string;
  name: string;
  style: BridalStyleId;
  image: boolean;
  lipId: string;
  finishId: string;
  prompt: string;
};

export type BridalHair = {
  id: string;
  name: string;
  style: BridalStyleId;
  image: boolean;
  prompt: string;
};

export type MehendiCard = {
  id: string;
  name: string;
  style: BridalStyleId;
  image: boolean;
  styleId: string;
  coverageId: string;
  shadeId: string;
  densityId: string;
};

export type BridalFinish = { id: string; label: string; prompt: string };
export type BridalLip = { id: string; name: string; hex: string };
export type MehendiOption = { id: string; label: string };

export const BRIDAL_STYLES: { id: BridalStyleId; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "temple", label: "Temple & Traditional" },
];

export const BRIDAL_EVENTS: { id: BridalEventId; label: string }[] = [
  { id: "wedding", label: "Wedding" },
  { id: "engagement", label: "Engagement" },
  { id: "haldi", label: "Haldi" },
  { id: "mehendi", label: "Mehendi" },
  { id: "sangeet", label: "Sangeet" },
  { id: "reception", label: "Reception" },
];

export const BRIDAL_LOOKS: BridalLook[] = [
  {
    id: "telugu-muhurtham",
    name: "Telugu Muhurtham Classic",
    region: "Telugu",
    style: "temple",
    image: true,
    blurb: "Red and green pattu, temple gold, sleek low bun",
    prompt: "Telugu muhurtham bride in a red and green silk pattu saree, temple gold necklace, nethichutti, jhumkas, and a round red bindi",
    events: ["wedding"],
  },
  {
    id: "gadwal-telangana",
    name: "Telangana Gadwal Bride",
    region: "Telugu",
    style: "temple",
    image: true,
    blurb: "Green Gadwal saree, coin necklace, sleek bun",
    prompt: "Telangana bride in a green Gadwal silk saree with a red-gold border, long gold coin necklace, nose ring, and jhumkas",
    events: ["wedding"],
  },
  {
    id: "uppada-andhra",
    name: "Andhra Uppada Bride",
    region: "Telugu",
    style: "temple",
    image: true,
    blurb: "Peach Uppada silk, coin braid, temple gold",
    prompt: "Andhra bride in a peach-gold Uppada silk saree, maang tikka, coin necklace, and jhumkas",
    events: ["wedding"],
  },
  {
    id: "pellikuthuru-haldi",
    name: "Pellikuthuru Haldi",
    region: "Telugu",
    style: "temple",
    image: true,
    blurb: "Yellow saree, turmeric marks, sleek bun",
    prompt: "Telugu pellikuthuru at haldi, yellow saree, turmeric marks on the cheeks, and floral jewellery",
    events: ["haldi"],
  },
  {
    id: "telugu-sangeet-glam",
    name: "Telugu Sangeet Glam",
    region: "Telugu",
    style: "temple",
    image: true,
    blurb: "Magenta embroidery, open waves, chandelier earrings",
    prompt: "Telugu sangeet look, magenta blouse with gold floral embroidery, chandelier earrings, and a smoky eye",
    events: ["sangeet", "engagement", "mehendi"],
  },
  {
    id: "telugu-reception-modern",
    name: "Telugu Reception Modern",
    region: "Telugu",
    style: "temple",
    image: true,
    blurb: "Champagne saree, diamonds, open waves",
    prompt: "Telugu reception look, champagne embroidered saree, diamond necklace and earrings, and a polished evening finish",
    events: ["reception", "engagement"],
  },
];

export const BRIDAL_MAKEUP: BridalMakeup[] = [
  {
    id: "makeup-classic-red",
    name: "Classic Red",
    style: "temple",
    image: true,
    lipId: "red",
    finishId: "hd",
    prompt: "Makeup: classic bridal red lip, even HD base, kohl, and a round red bindi.",
  },
  {
    id: "makeup-maroon",
    name: "Maroon Matte",
    style: "temple",
    image: true,
    lipId: "maroon",
    finishId: "matte",
    prompt: "Makeup: maroon matte lip, matte skin, and a defined eye.",
  },
  {
    id: "makeup-nude-rose",
    name: "Nude-Rose Dewy",
    style: "temple",
    image: true,
    lipId: "nude-rose",
    finishId: "dewy",
    prompt: "Makeup: nude-rose lip, dewy skin, and a soft glow.",
  },
  {
    id: "makeup-reception-glam",
    name: "Reception Glam",
    style: "temple",
    image: true,
    lipId: "berry",
    finishId: "glam",
    prompt: "Makeup: reception glam with a gold smoky eye, lashes, and a deep berry lip.",
  },
];

export const BRIDAL_HAIR: BridalHair[] = [
  {
    id: "hair-sleek-low-bun",
    name: "Sleek low bun",
    style: "temple",
    image: false,
    prompt: "Hairstyle to add: a sleek low bun with a clean centre parting, a matha patti along the hairline, and soft volume at the crown. Keep the hair free of flowers.",
  },
  {
    id: "hair-textured-side-bun",
    name: "Textured side bun",
    style: "temple",
    image: false,
    prompt: "Hairstyle to add: a textured side bun with a soft side parting, a maang tikka, and a little height at the crown. Keep the hair free of flowers.",
  },
  {
    id: "hair-volume-updo",
    name: "Volume updo with matha patti",
    style: "temple",
    image: false,
    prompt: "Hairstyle to add: a volume updo with a centre parting, a matha patti, and soft crown volume. Keep the hair free of flowers.",
  },
];

export const BRIDAL_FINISHES: BridalFinish[] = [
  { id: "hd", label: "HD", prompt: "Photo-ready HD makeup with an even base that still looks like skin." },
  { id: "airbrush", label: "Airbrush", prompt: "Airbrush finish: smooth, lightweight, and even, without a cakey mask." },
  { id: "matte", label: "Matte", prompt: "Matte finish with a soft blur and little shine on the skin." },
  { id: "dewy", label: "Dewy", prompt: "Dewy finish with a healthy highlight on the cheekbones." },
  { id: "minimal", label: "Minimal", prompt: "Minimal makeup: skin, brows, and a soft lip. Keep it light." },
  { id: "glam", label: "Glam", prompt: "Glam finish with defined eyes, lashes, and a polished lip." },
];

export const BRIDAL_LIPS: BridalLip[] = [
  { id: "red", name: "Red", hex: "#9B2335" },
  { id: "maroon", name: "Maroon", hex: "#6E1E2A" },
  { id: "berry", name: "Berry", hex: "#8E3A59" },
  { id: "fuchsia", name: "Fuchsia", hex: "#C43B6E" },
  { id: "pink", name: "Pink", hex: "#E58AA0" },
  { id: "nude", name: "Nude", hex: "#C48A78" },
  { id: "nude-rose", name: "Nude-Rose", hex: "#C98986" },
];

export const MEHENDI_STYLES: MehendiOption[] = [
  { id: "bridal", label: "Full traditional bridal" },
  { id: "simple", label: "Light modern" },
];

export const MEHENDI_CARDS: MehendiCard[] = [
  { id: "mehendi-bridal", name: "Full traditional bridal", style: "temple", image: true, styleId: "bridal", coverageId: "full", shadeId: "maroon", densityId: "heavy" },
  { id: "mehendi-simple", name: "Light modern", style: "temple", image: true, styleId: "simple", coverageId: "palm", shadeId: "brown", densityId: "light" },
];

export const MEHENDI_COVERAGE: MehendiOption[] = [
  { id: "palm", label: "Palm" },
  { id: "back", label: "Back of hand" },
  { id: "full", label: "Full hand" },
  { id: "arm", label: "Hand and arm" },
];

export const MEHENDI_SHADES: MehendiOption[] = [
  { id: "orange", label: "Fresh orange" },
  { id: "brown", label: "Reddish brown" },
  { id: "maroon", label: "Deep maroon" },
];

export const MEHENDI_DENSITY: MehendiOption[] = [
  { id: "light", label: "Light" },
  { id: "medium", label: "Medium" },
  { id: "heavy", label: "Heavy" },
];

/** Owner-editable packages. A price of 0 stays hidden from the bride. */
export const BRIDAL_PACKAGES: { key: string; name: string; hint: string }[] = [
  { key: "bridal-classic", name: "Classic", hint: "Often about ₹6,000–10,000" },
  { key: "bridal-signature", name: "Signature", hint: "Often about ₹15,000–25,000" },
  { key: "bridal-royal", name: "Royal", hint: "Often about ₹30,000–45,000" },
];

export const BRIDAL_PACKAGE_KEYS = new Set(BRIDAL_PACKAGES.map((pack) => pack.key));

export function bridalEventById(id: string) {
  return BRIDAL_EVENTS.find((event) => event.id === id) ?? null;
}

export function bridalLookById(id: string) {
  return BRIDAL_LOOKS.find((look) => look.id === id) ?? null;
}

export function bridalFinishById(id: string) {
  return BRIDAL_FINISHES.find((finish) => finish.id === id) ?? BRIDAL_FINISHES[0];
}

export function bridalLipById(id: string) {
  return BRIDAL_LIPS.find((lip) => lip.id === id) ?? BRIDAL_LIPS[0];
}

/** A known makeup card, or null when the id was not one of the four. */
export function bridalMakeupById(id: string) {
  return BRIDAL_MAKEUP.find((item) => item.id === id) ?? null;
}

export function bridalHairById(id: string) {
  return BRIDAL_HAIR.find((item) => item.id === id) ?? null;
}

export function mehendiCardById(id: string) {
  return MEHENDI_CARDS.find((item) => item.id === id) ?? null;
}

/** Styles that have their own cards. An empty Trending set is omitted so its chip stays hidden. */
export function bridalStylesFor(items: { style: BridalStyleId }[]) {
  return BRIDAL_STYLES.filter((style) => items.some((item) => item.style === style.id));
}

/** A single category is not a choice, so the tab row stays hidden. */
export function showStyleTabs(styles: { id: string }[]) {
  return styles.length > 1;
}

/** Trending when that set exists, otherwise Temple & Traditional. */
export function defaultBridalStyle(items: { style: BridalStyleId }[]): BridalStyleId {
  return bridalStylesFor(items)[0]?.id ?? "temple";
}

/** Cards in this style. An empty Trending request shows Temple & Traditional so the step is not blank. */
export function cardsForStyle<T extends { style: BridalStyleId }>(items: T[], style: BridalStyleId): T[] {
  const own = items.filter((item) => item.style === style);
  if (own.length || style === "temple") return own;
  return items.filter((item) => item.style === "temple");
}

/** Looks tagged for this event. A day with no portrait of its own uses the wedding set. */
export function looksForEvent(eventId: string) {
  const matched = BRIDAL_LOOKS.filter((look) => look.events.includes(eventId as BridalEventId));
  if (matched.length) return matched;
  return BRIDAL_LOOKS.filter((look) => look.events.includes("wedding"));
}

export function mehendiChoice(list: MehendiOption[], id: string) {
  return list.find((item) => item.id === id) ?? null;
}
