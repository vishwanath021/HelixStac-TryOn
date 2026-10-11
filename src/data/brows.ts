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
  { id: "thin", label: "Thin", line: "Stroke weight: a thin sparse brow." },
  { id: "natural", label: "Natural", line: "Stroke weight: a natural medium brow." },
  { id: "bold", label: "Bold", line: "Stroke weight: a bold dense brow." },
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
    description: "A low, gentle arch with a soft tail.",
    prompt: "Arch position: a low gentle rise just past the iris. Tail: a soft downward taper.",
  }),
  brow({
    id: "high-arch",
    name: "High Arch",
    audience: "women",
    description: "A higher peak and a cleaner tail.",
    prompt: "Arch position: a high peak above the outer iris. Tail: a steep descent after the peak.",
  }),
  brow({
    id: "straight-brow",
    name: "Straight",
    audience: "unisex",
    description: "A flatter brow with a short, level tail.",
    prompt: "Arch position: almost no peak, the body stays level. Tail: short and level with the head.",
  }),
  brow({
    id: "rounded",
    name: "Rounded",
    audience: "women",
    description: "A smooth curve without a sharp peak.",
    prompt: "Arch position: a smooth dome with no corner. Tail: a soft rounded end.",
  }),
  brow({
    id: "s-shape",
    name: "S-Shape",
    audience: "women",
    description: "A gentle S from a fuller head into a lifted tail.",
    prompt: "Arch position: the head dips, then the body lifts into an S. Tail: a small upward flick.",
  }),
  brow({
    id: "feathered",
    name: "Feathered",
    audience: "unisex",
    description: "Brushed, feathery strokes with a light tail.",
    prompt: "Arch position: a light brushed rise. Tail: hair strokes flatten and fade.",
  }),
  brow({
    id: "bold-natural",
    name: "Bold Natural",
    audience: "unisex",
    description: "A fuller natural brow with a modest arch.",
    prompt: "Arch position: a modest low rise. Tail: stays wide instead of pinching to a line.",
  }),
  brow({
    id: "angled",
    name: "Angled",
    audience: "unisex",
    description: "A hard angle with a straight descending tail.",
    prompt: "Arch position: two straight edges meet in a hard angle above the outer iris. Tail: a straight line dropping away from that corner.",
  }),
  brow({
    id: "flat-thick",
    name: "Flat Thick",
    audience: "men",
    description: "A flat, heavy bar with no arch.",
    prompt: "Arch position: no arch, a flat bar across the brow bone. Tail: squared off at the same height as the head.",
  }),
  brow({
    id: "natural-groomed",
    name: "Natural Groomed",
    audience: "men",
    description: "A short tidy brow that stops near the outer eye.",
    prompt: "Arch position: a slight tidy rise that stops near the outer eye. Tail: short and cleaned, not extended.",
  }),
  brow({
    id: "thin-defined",
    name: "Thin Defined",
    audience: "women",
    description: "A precise high peak with a long fine tail.",
    prompt: "Arch position: a precise high peak. Tail: a long fine point.",
  }),
  brow({
    id: "tapered",
    name: "Tapered",
    audience: "unisex",
    description: "Fuller at the inner head, narrowing to a point.",
    prompt: "Arch position: fuller at the inner head and steadily narrowing. Tail: a sharp point.",
  }),
  brow({
    id: "cleanup",
    name: "Clean-up",
    audience: "unisex",
    description: "Keep the current shape and only tidy stray hairs.",
    prompt: "Arch position: keep the customer's current arch. Tail: keep the current tail. Only tidy stray hairs outside the existing shape.",
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
