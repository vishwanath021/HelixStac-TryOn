export type BeardDef = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  serviceKeys: string[];
};

const services = ["beard"];

function beard(draft: Omit<BeardDef, "serviceKeys"> & { serviceKeys?: string[] }): BeardDef {
  return { serviceKeys: draft.serviceKeys ?? services, ...draft };
}

export const BEARDS: BeardDef[] = [
  beard({
    id: "light-stubble",
    name: "Light Stubble",
    description: "A short, even shadow along the jaw.",
    prompt: "Even 1–2 day stubble on the jaw, chin, and moustache area. Keep the cheek line soft and the neck clean.",
  }),
  beard({
    id: "short-boxed",
    name: "Short Boxed",
    description: "A short beard with a squared cheek and neck line.",
    prompt: "A short boxed beard. The cheek line is defined, the neck line sits above the Adam's apple, and the length is even and close.",
  }),
  beard({
    id: "full-beard",
    name: "Full Beard",
    description: "A fuller beard with natural cheeks.",
    prompt: "A full beard of medium length. Cheeks are filled, the moustache joins the beard, and the outline is tidy but not carved into a sharp graphic.",
  }),
  beard({
    id: "goatee",
    name: "Goatee",
    description: "Chin and moustache, with clear cheeks.",
    prompt: "A goatee: hair on the chin and moustache only. Cheeks and jaw sides are clean. The chin hair is short and shaped.",
  }),
  beard({
    id: "french-beard",
    name: "French Beard",
    description: "A pointed chin beard with a separated moustache.",
    prompt: "A French beard: a small pointed chin beard and a moustache with a narrow gap at the corners of the mouth. Cheeks stay clean.",
  }),
  beard({
    id: "clean-shave",
    name: "Clean Shave",
    description: "No visible facial hair.",
    prompt: "A clean shave. Remove visible stubble from the cheeks, jaw, chin, moustache, and neck. Skin texture stays the same.",
    serviceKeys: ["beard"],
  }),
  beard({
    id: "van-dyke",
    name: "Van Dyke",
    description: "A disconnected moustache and chin beard.",
    prompt: "A Van Dyke: a moustache and a separate chin beard, with bare skin between them. Keep both parts short.",
  }),
  beard({
    id: "anchor",
    name: "Anchor",
    description: "A pointed chin with a moustache that curves down.",
    prompt: "An anchor beard: moustache connected in a narrow line to a pointed chin. Cheeks are clean. The shape is small.",
  }),
  beard({
    id: "circle-beard",
    name: "Circle Beard",
    description: "A rounded goatee that connects moustache and chin.",
    prompt: "A circle beard: moustache and chin connected in a rounded shape. Cheeks and the rest of the jaw are clean.",
  }),
  beard({
    id: "corporate-stubble",
    name: "Corporate Stubble",
    description: "Very short, even facial hair with a sharp neck line.",
    prompt: "Very short even stubble, about the same length everywhere it grows, with a clean neck line. Suitable for an office look.",
  }),
];

export function beardById(id: string | null | undefined) {
  if (!id) return null;
  return BEARDS.find((item) => item.id === id) ?? null;
}

export type PublicBeard = Omit<BeardDef, "prompt">;

export function toPublicBeard(item: BeardDef): PublicBeard {
  const rest = { ...item };
  delete (rest as { prompt?: string }).prompt;
  return rest;
}
