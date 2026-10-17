/** The bride's own clothes and jewellery. Each slot is optional. */

export const OWN_LOOK_SLOTS = [
  { id: "saree", label: "Saree", noun: "saree" },
  { id: "blouse", label: "Blouse", noun: "blouse" },
  { id: "necklace", label: "Necklace", noun: "necklace" },
  { id: "earrings", label: "Earrings", noun: "earrings" },
  { id: "maang-tikka", label: "Maang tikka", noun: "maang tikka" },
  { id: "bangles", label: "Bangles", noun: "bangles" },
  { id: "nose-ring", label: "Nose ring", noun: "nose ring" },
  { id: "hair-accessories", label: "Hair accessories", noun: "hair accessories" },
  { id: "other", label: "Other", noun: "other item" },
] as const;

export type OwnLookSlotId = (typeof OWN_LOOK_SLOTS)[number]["id"];

/** Precise edit model. Quality stays medium. input_fidelity is not in this model's parameter table. */
export const OWN_LOOK_MODEL = "gpt-image-2.5-sunburst";
export const OWN_LOOK_QUALITY = "medium" as const;
/** 3:4 selfie canvas. Other aspects use a catalogue size chosen from the photo. */
export const OWN_LOOK_THREE_BY_FOUR = "1024x1360" as const;
/** Longest edge for the saree photo. */
export const OWN_LOOK_SAREE_EDGE = 512;
/** Longest edge for a jewellery photo, so the piece stays readable. */
export const OWN_LOOK_JEWELLERY_EDGE = 640;
/** Longest edge for blouse, hair accessories, and other. */
export const OWN_LOOK_ITEM_EDGE = 384;

const JEWELLERY_SLOTS = new Set<OwnLookSlotId>(["necklace", "earrings", "maang-tikka", "bangles", "nose-ring"]);

export function ownLookItemEdge(id: string) {
  if (id === "saree") return OWN_LOOK_SAREE_EDGE;
  if (JEWELLERY_SLOTS.has(id as OwnLookSlotId)) return OWN_LOOK_JEWELLERY_EDGE;
  return OWN_LOOK_ITEM_EDGE;
}
export const OWN_LOOK_MAX_BYTES = 2 * 1024 * 1024;
/** Selfie plus every slot. A request with more files is refused. */
export const OWN_LOOK_MAX_IMAGES = 1 + OWN_LOOK_SLOTS.length;

export function ownLookSlot(id: string) {
  return OWN_LOOK_SLOTS.find((slot) => slot.id === id) ?? null;
}
