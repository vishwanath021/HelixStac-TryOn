export type NailDef = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  serviceKeys: string[];
};

const services = ["nails"];

function nail(draft: Omit<NailDef, "serviceKeys"> & { serviceKeys?: string[] }): NailDef {
  return { serviceKeys: draft.serviceKeys ?? services, ...draft };
}

export const NAILS: NailDef[] = [
  nail({
    id: "classic-french",
    name: "Classic French",
    description: "A nude base with a pale tip.",
    prompt: "A classic French manicure on the visible fingernails: a warm nude base and a thin natural-white tip. Nails stay the length already in the photo.",
  }),
  nail({
    id: "glossy-red",
    name: "Glossy Red",
    description: "A solid glossy red.",
    prompt: "Solid glossy red polish on the visible fingernails. One even coat, with a small light reflection. Do not lengthen the nails.",
  }),
  nail({
    id: "nude-minimal",
    name: "Nude Minimal",
    description: "A sheer nude close to the skin tone.",
    prompt: "A sheer nude polish close to the skin tone already visible. Nails look tidy and short of decoration.",
  }),
  nail({
    id: "chrome-silver",
    name: "Chrome Silver",
    description: "A mirror silver chrome.",
    prompt: "A smooth silver chrome finish on the visible fingernails. Reflective, not glitter particles.",
  }),
  nail({
    id: "glitter-ombre",
    name: "Glitter Ombré",
    description: "A soft fade into fine glitter at the tip.",
    prompt: "A nude base that fades into fine champagne glitter at the free edge of each visible nail.",
  }),
  nail({
    id: "pearl-accent",
    name: "Pearl Accent",
    description: "A glossy nude with one small pearl on the ring finger.",
    prompt: "Glossy warm-nude polish, with a single small round pearl on the ring-finger nail only. Other nails stay plain.",
  }),
  nail({
    id: "floral-tip",
    name: "Floral Tip",
    description: "A tiny painted flower on one nail.",
    prompt: "Soft pink polish with one small painted flower on the ring finger. The other visible nails stay plain. Keep the flower tiny.",
  }),
  nail({
    id: "marble-nude",
    name: "Marble Nude",
    description: "A pale marble swirl.",
    prompt: "A pale nude and white marble swirl on the visible fingernails. Soft veins, not a loud pattern.",
  }),
  nail({
    id: "cat-eye",
    name: "Cat Eye",
    description: "A dark polish with one vertical light streak.",
    prompt: "A deep brown cat-eye polish on the visible nails: one narrow vertical streak of light on each nail.",
  }),
  nail({
    id: "bridal-glam",
    name: "Bridal Glam",
    description: "A pale shimmer with a fine gold line.",
    prompt: "A pale champagne shimmer on the visible nails, with a thin gold line near the cuticle of the ring finger only.",
  }),
];

export function nailById(id: string | null | undefined) {
  if (!id) return null;
  return NAILS.find((item) => item.id === id) ?? null;
}

export type PublicNail = Omit<NailDef, "prompt">;

export function toPublicNail(item: NailDef): PublicNail {
  const rest = { ...item };
  delete (rest as { prompt?: string }).prompt;
  return rest;
}
