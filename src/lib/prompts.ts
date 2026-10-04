import type { BeardDef } from "@/data/beards";
import type { BrowDef } from "@/data/brows";
import type { NailDef } from "@/data/nails";
import { lengthCategoryFor, type StyleDef } from "@/data/styles";

export function buildStylePrompt(style: StyleDef, colourName?: string) {
  return [
    `Edit the person's hair only. New hairstyle: ${style.name}.`,
    style.prompt,
    colourName
      ? `Shift the hair colour toward ${colourName}. Keep it believable on the hair already in the photo.`
      : "Keep the current hair colour, except where the haircut changes how light falls.",
    "The mask is the only editable area. Transparent mask pixels may change. Opaque mask pixels must stay identical to the photo.",
    "Keep the head, face, and framing exactly the same size and position. Do not zoom, crop, re-frame, or move the subject.",
    "Keep the face, forehead skin, eyes, brows, nose, and lips untouched.",
    "Change only hair length, cut, and shape inside the mask. Keep a natural hairline.",
    "Remove original hair that falls outside the new style but is still inside the mask, such as long hair becoming a bob.",
    "Keep the same person: identity, skin tone, expression, age, gender presentation, clothing, jewellery, background, lighting, camera angle, and pose must stay unchanged.",
    "Do not add or remove people. Do not add text, logos, or watermarks. Photorealistic. Respect the Indian hair texture already visible: straight, wavy, curly, thick, or thin.",
    "The result is a salon consultation preview, not a guarantee of the finished cut.",
  ].join(" ");
}

function lengthInstruction(style: StyleDef) {
  const length = lengthCategoryFor(style);
  if (length === "short") {
    return "The selected cut is short. If the person in Image 1 currently has longer hair, this is a long-to-short change: remove the extra hair and plausibly reconstruct exposed neck, ears, and background.";
  }
  if (length === "medium") {
    return "The selected cut is medium length. If Image 1 has longer hair, remove the extra length and reconstruct what it covered. If Image 1 has shorter hair, extend the hair without enlarging the head.";
  }
  return "The selected cut is long. If the person in Image 1 currently has shorter hair, this is a short-to-long change: extend the hair without enlarging the head or changing the framing.";
}

/** Reference-mode prompt. No mask sentences. Image 1 is the person. Image 2 is the haircut only. */
export function buildReferencePrompt(style: StyleDef, colourName?: string) {
  const colour = colourName
    ? `A colour change was requested: shift the hair colour toward ${colourName}.`
    : "Keep the original hair colour unless a colour change was requested.";
  return [
    "Image 1 is the person to edit. Image 2 is a hairstyle reference only.",
    `Produce one photorealistic edited photograph of the person in Image 1 wearing ${style.name}. ${style.prompt}`,
    "Transfer the haircut's silhouette, length, layering, fringe and parting from Image 2, adapted naturally to the person's head and existing hair texture.",
    "Preserve the identity, facial features, expression, pose, head size, camera position, clothing, jewellery, background and lighting from Image 1.",
    colour,
    "Do not transfer the reference person's face, skin, clothing, pose or background.",
    lengthInstruction(style),
    "Remove original hair that conflicts with the new cut and plausibly reconstruct exposed background, neck or clothing.",
    "Keep natural strands, hairline, shadows and occlusion.",
    "Return the complete edited photograph without text or a collage.",
  ].join(" ");
}

export function buildBrowPrompt(brow: BrowDef) {
  return [
    `Edit the eyebrows only. New brow shape: ${brow.name}.`,
    brow.prompt,
    "Change only the eyebrows. Keep identity, face, eyes, nose, lips, jaw, skin tone, skin texture, moles, hair, hairline, expression, clothing, jewellery, background, lighting, camera angle, and pose unchanged.",
    "Do not add or remove people. Do not add text, logos, or watermarks. Photorealistic brow hair that respects the density and growth already visible.",
    "The result is a salon consultation preview, not a guarantee of the finished shape.",
  ].join(" ");
}

export function buildBeardPrompt(beard: BeardDef) {
  return [
    `Edit the facial hair only. New beard: ${beard.name}.`,
    beard.prompt,
    "Change only facial hair. Keep identity, face, eyes, brows, nose, lips, jaw shape, skin tone, skin texture, moles, scalp hair, hairline, expression, clothing, background, lighting, and pose unchanged.",
    "Do not add or remove people. Do not add text, logos, or watermarks. Photorealistic, suitable for Indian facial-hair density.",
    "The result is a consultation preview, not a guarantee of the finished shave or beard.",
  ].join(" ");
}

export function buildNailPrompt(nail: NailDef) {
  return [
    `Edit the fingernails only. New nail design: ${nail.name}.`,
    nail.prompt,
    "Change only the polish or art on nails that are already visible. Keep identity, skin tone, hands, fingers, nail length, nail shape, jewellery, clothing, background, and pose unchanged.",
    "Do not add extra fingers or nails. Do not add text, logos, or watermarks.",
    "The result is a consultation preview, not a guarantee of the finished manicure.",
  ].join(" ");
}
