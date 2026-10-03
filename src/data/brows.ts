export type BrowDef = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  serviceKeys: string[];
};

const services = ["eyebrow-threading", "eyebrow-shaping"];

function brow(draft: Omit<BrowDef, "serviceKeys"> & { serviceKeys?: string[] }): BrowDef {
  return { serviceKeys: draft.serviceKeys ?? services, ...draft };
}

export const BROWS: BrowDef[] = [
  brow({
    id: "soft-arch",
    name: "Soft Arch",
    description: "A low, gentle arch with a soft tail.",
    prompt: "A soft, low arch. The brow starts fuller at the head, rises slightly past the iris, and tapers to a fine tail. Hair strokes stay natural and not sharply drawn.",
  }),
  brow({
    id: "straight-brow",
    name: "Straight Brow",
    description: "A flatter brow with a short, level tail.",
    prompt: "A straighter brow with very little peak. The body stays level, the head is softly squared, and the tail is short. Keep the density even.",
  }),
  brow({
    id: "high-arch",
    name: "High Arch",
    description: "A higher peak and a cleaner tail.",
    prompt: "A higher arch. The peak sits above the outer iris, then the tail descends. The shape is defined but still made of brow hair, not a solid pencil block.",
  }),
  brow({
    id: "rounded",
    name: "Rounded",
    description: "A smooth curve without a sharp peak.",
    prompt: "A rounded brow. The top edge is a smooth curve with no sharp angle. The tail is soft and the head blends into the skin.",
  }),
  brow({
    id: "s-shape",
    name: "S-Shape",
    description: "A gentle S from a fuller head into a lifted tail.",
    prompt: "A gentle S-shaped brow. The head sits slightly lower, the body lifts, and the tail flicks softly. Do not make it cartoonish or overly thin.",
  }),
  brow({
    id: "feathered",
    name: "Feathered",
    description: "Brushed, feathery strokes with a light tail.",
    prompt: "A feathered brow. Individual hair strokes are visible, brushed upward through the head and flatter toward the tail. The edge is soft, not stamped on.",
  }),
  brow({
    id: "bold-natural",
    name: "Bold Natural",
    description: "A fuller natural brow with a modest arch.",
    prompt: "A fuller natural brow. Keep more density through the body, a modest arch, and a tail that does not become a thin line. It should look grown, not filled in as a block.",
  }),
];

export function browById(id: string | null | undefined) {
  if (!id) return null;
  return BROWS.find((item) => item.id === id) ?? null;
}

export type PublicBrow = Omit<BrowDef, "prompt">;

export function toPublicBrow(browShape: BrowDef): PublicBrow {
  const rest = { ...browShape };
  delete (rest as { prompt?: string }).prompt;
  return rest;
}
