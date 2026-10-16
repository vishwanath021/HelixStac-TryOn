/** Indian bridal catalogue. Hyderabad / Telugu looks stay first. */

export type BridalEventId = "wedding" | "engagement" | "haldi" | "mehendi" | "sangeet" | "reception";

export type BridalLook = {
  id: string;
  name: string;
  region: string;
  blurb: string;
  prompt: string;
  events: BridalEventId[];
};

export type BridalFinish = { id: string; label: string; prompt: string };
export type BridalLip = { id: string; name: string; hex: string };
export type MehendiOption = { id: string; label: string };

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
    blurb: "Poola jada, gold-copper eyes, berry lip, temple jewellery",
    prompt: "Telugu bride, full jasmine-rose poola jada braid with gold jada billalu, HD full-coverage base, gold-copper eyeshadow, thick kohl, berry lip, round red bindi, nethichutti, temple gold necklace, red-green pattu saree",
    events: ["wedding"],
  },
  {
    id: "telugu-jasmine-bun",
    name: "Telugu Jasmine Bun",
    region: "Telugu",
    blurb: "Low jasmine bun, red lip, maang tikka",
    prompt: "South Indian bride, low round bun wrapped in jasmine, gold shimmer lids, kohl, classic red matte lip, red bindi, gold maang tikka, jhumkas, Kanjeevaram saree",
    events: ["wedding", "reception"],
  },
  {
    id: "tamil-kanjeevaram",
    name: "Tamil Kanjeevaram",
    region: "Tamil",
    blurb: "Jasmine braid, bold kohl, maroon lip",
    prompt: "Tamil bride, long braid with jasmine strands, dramatic kohl top and bottom, gold eyes, maroon lip, red bindi, nethichutti, temple jewellery, kanjeevaram silk",
    events: ["wedding"],
  },
  {
    id: "kerala-kasavu",
    name: "Kerala Kasavu Minimal",
    region: "Kerala",
    blurb: "Jasmine bun, dewy skin, nude lip, minimal gold",
    prompt: "Kerala bride, jasmine bun, dewy natural skin, kohl-lined eyes, nude-pink lip, small bindi, gold-bordered off-white kasavu saree, palakka necklace",
    events: ["wedding"],
  },
  {
    id: "punjabi-glam",
    name: "Punjabi Glam Updo",
    region: "Punjabi",
    blurb: "Updo, glitter eyes, red lip, maang tikka and nath",
    prompt: "Punjabi bride, sleek updo under red embroidered dupatta, glittery gold eyes, winged liner, false lashes, red lip, dewy highlight, large maang tikka, big nath with chain",
    events: ["wedding", "sangeet"],
  },
  {
    id: "bengali-chandan",
    name: "Bengali Chandan",
    region: "Bengali",
    blurb: "Chandan dots, winged liner, red lip, mukut",
    prompt: "Bengali bride, red bindi with white chandan dot pattern on forehead, winged liner, gold-red eyeshadow, red lip, dewy skin, white shola topor/mukut, red Benarasi saree",
    events: ["wedding"],
  },
  {
    id: "marathi-nauvari",
    name: "Marathi Nauvari",
    region: "Marathi",
    blurb: "Gajra bun, crescent bindi, nath, mundavalya",
    prompt: "Maharashtrian bride, bun with mogra gajra, pearl mundavalya across forehead, crescent bindi, kohl, soft gold eyes, crimson lip, Maharashtrian nath, Paithani nauvari saree",
    events: ["wedding"],
  },
  {
    id: "gujarati-panetar",
    name: "Gujarati Panetar",
    region: "Gujarati",
    blurb: "Bun, bold kohl, deep lip, kundan, seedha pallu",
    prompt: "Gujarati bride, neat bun, bold kohl and shimmer eyes, deep red lip, kundan maang tikka and choker, white-red panetar saree in seedha pallu drape",
    events: ["wedding"],
  },
  {
    id: "nikah-kohl",
    name: "Nikah Kohl Glow",
    region: "Nikah",
    blurb: "Side-swept hair, passa, dark kohl, dewy highlight",
    prompt: "Muslim bride for nikah, side-swept hair with jhoomar passa, dark smudged kohl eyes, strong highlighter, dewy skin, rose-nude lip, heavy embroidered dupatta, velvet outfit",
    events: ["wedding", "reception"],
  },
  {
    id: "christian-gown",
    name: "Christian White Gown",
    region: "Christian",
    blurb: "Half-up waves, veil, soft smoky eye, pink lip",
    prompt: "Christian bride, soft half-up curls, long white veil with tiara, luminous light base, soft brown smoky eye, peach blush, pink lip, white lace gown, diamond studs",
    events: ["wedding"],
  },
  {
    id: "engagement-soft-glam",
    name: "Engagement Soft Glam",
    region: "Engagement",
    blurb: "Soft waves, dewy skin, nude-pink lip",
    prompt: "Indian bride at engagement, voluminous soft waves, dewy HD base, champagne shimmer eyes, nude-pink gloss lip, diamond earrings, pastel lehenga",
    events: ["engagement"],
  },
  {
    id: "haldi-fresh",
    name: "Haldi Fresh",
    region: "Haldi",
    blurb: "Marigold braid, no-makeup glow",
    prompt: "Indian bride at haldi, messy side braid with yellow marigold flowers, no-makeup dewy skin, tinted lips, floral jewellery, yellow outfit",
    events: ["haldi"],
  },
  {
    id: "mehendi-boho",
    name: "Mehendi Boho",
    region: "Mehendi",
    blurb: "Floral braid, coral lip, floral tikka",
    prompt: "Indian bride at mehendi, loose braid with mixed flowers, warm bronze eyes, coral lip, floral maang tikka and earrings, green lehenga",
    events: ["mehendi"],
  },
  {
    id: "sangeet-smokey",
    name: "Sangeet Smokey Glam",
    region: "Sangeet",
    blurb: "Hollywood curls, smokey eye, nude lip",
    prompt: "Indian bride at sangeet, glam open curls, black-bronze smokey eye with glitter, sculpted contour, nude-brown matte lip, statement earrings, sequinned lehenga",
    events: ["sangeet"],
  },
  {
    id: "reception-luxe",
    name: "Reception Airbrush Luxe",
    region: "Reception",
    blurb: "Sleek bun, wine lip, diamond set",
    prompt: "Indian bride at reception, sleek low bun with accessory, flawless airbrush matte base, cut-crease eyes, wine lip, diamond necklace set, embellished saree gown",
    events: ["reception", "engagement"],
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
];

export const MEHENDI_STYLES: MehendiOption[] = [
  { id: "bridal", label: "Bridal" },
  { id: "arabic", label: "Arabic" },
  { id: "mandala", label: "Mandala" },
  { id: "simple", label: "Simple" },
  { id: "rajasthani", label: "Rajasthani" },
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

/** Telugu looks stay first. Looks for the chosen event come next. */
export function looksForEvent(eventId: string) {
  const telugu = BRIDAL_LOOKS.filter((look) => look.region === "Telugu");
  const rest = BRIDAL_LOOKS.filter((look) => look.region !== "Telugu");
  const matched = rest.filter((look) => look.events.includes(eventId as BridalEventId));
  const other = rest.filter((look) => !look.events.includes(eventId as BridalEventId));
  return [...telugu, ...matched, ...other];
}

export function mehendiChoice(list: MehendiOption[], id: string) {
  return list.find((item) => item.id === id) ?? null;
}
