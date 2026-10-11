export type BrowAudience = "women" | "men" | "unisex";

export type BrowDef = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  audience: BrowAudience;
  serviceKeys: string[];
};

export type BrowThickness = "thin" | "natural" | "bold";
export type BrowColour = "natural" | "soft-brown" | "dark";

export type BrowVariation = {
  thickness?: BrowThickness;
  colour?: BrowColour;
};

const services = ["eyebrow-threading", "eyebrow-shaping"];

function brow(draft: Omit<BrowDef, "serviceKeys"> & { serviceKeys?: string[] }): BrowDef {
  return { serviceKeys: draft.serviceKeys ?? services, ...draft };
}

export const BROW_THICKNESS: { id: BrowThickness; label: string; line: string }[] = [
  { id: "thin", label: "Thin", line: "Thickness scale: draw the head and the tail at 60% of the stated start thickness and tail thickness. Keep the stated arch position, arch height, and tail angle." },
  { id: "natural", label: "Natural", line: "Thickness scale: draw the head and the tail at 100% of the stated start thickness and tail thickness. Keep the stated arch position, arch height, and tail angle." },
  { id: "bold", label: "Bold", line: "Thickness scale: draw the head and the tail at 150% of the stated start thickness and tail thickness. Keep the stated arch position, arch height, and tail angle." },
];

export const BROW_COLOURS: { id: BrowColour; label: string; line: string }[] = [
  { id: "natural", label: "Natural", line: "Brow pigment: keep the natural brow colour from the selfie." },
  { id: "soft-brown", label: "Soft brown", line: "Brow pigment: a soft brown tint." },
  { id: "dark", label: "Dark", line: "Brow pigment: a dark brown-black tint." },
];

export const BROWS: BrowDef[] = [
  brow({
    id: "soft-arch",
    name: "Soft Arch",
    audience: "women",
    description: "A low gentle arch with a soft tail.",
    prompt:
      "Arch position: the peak sits at 62% of the brow length from the inner head. Arch height: 8% of the brow length, a gentle rise with no sharp corner. Tail angle: 15 degrees down from horizontal. Start thickness: 7% of the brow length. Tail thickness: 4% of the brow length, ending in a soft point.",
  }),
  brow({
    id: "high-arch",
    name: "High Arch",
    audience: "women",
    description: "A high peak and a steep tail.",
    prompt:
      "Arch position: the peak sits at 55% of the brow length from the inner head. Arch height: 22% of the brow length. Tail angle: 42 degrees down from horizontal. Start thickness: 6% of the brow length. Tail thickness: 2% of the brow length.",
  }),
  brow({
    id: "straight-brow",
    name: "Straight",
    audience: "unisex",
    description: "A level brow with a short tail.",
    prompt:
      "Arch position: no peak; the top edge stays level from the inner head to the tip. Arch height: 1% of the brow length. Tail angle: 0 degrees, level with the inner head. Start thickness: 7% of the brow length. Tail thickness: 7% of the brow length, and the brow ends near the outer corner of the eye.",
  }),
  brow({
    id: "rounded",
    name: "Rounded",
    audience: "women",
    description: "A smooth dome with a rounded tip.",
    prompt:
      "Arch position: the peak sits at 50% of the brow length from the inner head, as a smooth dome with no corner. Arch height: 14% of the brow length. Tail angle: 18 degrees down from horizontal. Start thickness: 8% of the brow length. Tail thickness: 6% of the brow length, with a rounded tip rather than a point.",
  }),
  brow({
    id: "feathered",
    name: "Feathered",
    audience: "unisex",
    description: "Hair strokes with a light fading tail.",
    prompt:
      "Arch position: the peak sits at 58% of the brow length from the inner head. Arch height: 6% of the brow length. Tail angle: 10 degrees down from horizontal. Start thickness: 6% of the brow length, drawn as separate hair strokes rather than a solid bar. Tail thickness: 1% of the brow length, fading into separated hairs.",
  }),
  brow({
    id: "bold-natural",
    name: "Bold Natural",
    audience: "unisex",
    description: "A full brow with a low arch and a wide tail.",
    prompt:
      "Arch position: the peak sits at 57% of the brow length from the inner head. Arch height: 7% of the brow length. Tail angle: 12 degrees down from horizontal. Start thickness: 12% of the brow length. Tail thickness: 9% of the brow length, staying wide instead of pinching to a line.",
  }),
  brow({
    id: "flat-thick",
    name: "Flat Thick",
    audience: "men",
    description: "A heavy flat bar with a squared end.",
    prompt:
      "Arch position: no peak; a flat bar along the brow bone. Arch height: 0% of the brow length. Tail angle: 0 degrees, the tail stays at the same height as the inner head. Start thickness: 16% of the brow length. Tail thickness: 16% of the brow length, with a squared end.",
  }),
  brow({
    id: "natural-groomed",
    name: "Natural Groomed",
    audience: "men",
    description: "A short tidy brow that stops at the outer eye.",
    prompt:
      "Arch position: the peak sits at 48% of the brow length from the inner head. Arch height: 6% of the brow length. Tail angle: 8 degrees down from horizontal. Start thickness: 9% of the brow length. Tail thickness: 7% of the brow length, and the brow stops at the outer corner of the eye.",
  }),
  brow({
    id: "thin-defined",
    name: "Thin Defined",
    audience: "women",
    description: "A sharp high peak with a long fine tail.",
    prompt:
      "Arch position: the peak sits at 66% of the brow length from the inner head. Arch height: 26% of the brow length, a sharp corner rather than a dome. Tail angle: 38 degrees down from horizontal. Start thickness: 3% of the brow length. Tail thickness: 1% of the brow length, and the tail continues past the outer corner of the eye.",
  }),
  brow({
    id: "tapered",
    name: "Tapered",
    audience: "unisex",
    description: "Full at the inner head, narrowing to a point.",
    prompt:
      "Arch position: the peak sits at 52% of the brow length from the inner head. Arch height: 5% of the brow length. Tail angle: 20 degrees down from horizontal. Start thickness: 11% of the brow length at the inner head. Tail thickness: 1.5% of the brow length, narrowing in a straight taper to a sharp point.",
  }),
  brow({
    id: "cleanup",
    name: "Clean-up",
    audience: "unisex",
    description: "Keep the current shape and only tidy stray hairs.",
    prompt:
      "Arch position: keep the peak wherever it already sits on this face. Arch height: keep the current height. Tail angle: keep the current angle. Start thickness: keep the current thickness at the inner head. Tail thickness: keep the current thickness at the tip. Remove only stray hairs outside that existing outline.",
  }),
];

export function browById(id: string | null | undefined) {
  if (!id) return null;
  return BROWS.find((item) => item.id === id) ?? null;
}

export function parseBrowThickness(value: unknown): BrowThickness {
  const text = String(value ?? "");
  return BROW_THICKNESS.some((item) => item.id === text) ? (text as BrowThickness) : "natural";
}

export function parseBrowColour(value: unknown): BrowColour {
  const text = String(value ?? "");
  return BROW_COLOURS.some((item) => item.id === text) ? (text as BrowColour) : "natural";
}

export function browThicknessLine(id: BrowThickness) {
  return BROW_THICKNESS.find((item) => item.id === id)?.line ?? BROW_THICKNESS[1].line;
}

export function browColourLine(id: BrowColour) {
  return BROW_COLOURS.find((item) => item.id === id)?.line ?? BROW_COLOURS[0].line;
}

const AUDIENCE_RANK: Record<"women" | "men" | "kids", Record<BrowAudience, number>> = {
  men: { men: 0, unisex: 1, women: 2 },
  women: { women: 0, unisex: 1, men: 2 },
  kids: { women: 0, unisex: 1, men: 2 },
};

/** Every brow stays visible. The customer's look only changes the order. */
export function browsForAudience<T extends { audience: BrowAudience }>(rows: readonly T[], look: "women" | "men" | "kids"): T[] {
  const rank = AUDIENCE_RANK[look];
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank[a.row.audience] - rank[b.row.audience] || a.index - b.index)
    .map((item) => item.row);
}

export type PublicBrow = Omit<BrowDef, "prompt">;

export function toPublicBrow(browShape: BrowDef): PublicBrow {
  const rest = { ...browShape };
  delete (rest as { prompt?: string }).prompt;
  return rest;
}
