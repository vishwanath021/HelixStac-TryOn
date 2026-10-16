import type { BridalFinish, BridalLip, BridalLook, MehendiOption } from "@/data/bridal";
import type { BeardDef } from "@/data/beards";
import { browColourLine, browThicknessLine, parseBrowColour, parseBrowThickness, type BrowDef, type BrowVariation } from "@/data/brows";
import type { NailDef } from "@/data/nails";
import type { ShadeDef } from "@/data/shades";
import { lengthCategoryFor, type StyleDef } from "@/data/styles";
import type { AskedTexture } from "@/lib/ai/reference-texture";

const IMAGE_ROLES = "Image 1 is the customer selfie, image 2 is the reference.";

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

function textureInstruction(texture?: AskedTexture) {
  const keep = "Keep the person's natural hair texture from Image 1, whether it is curly, wavy, straight, or coily. Adapt the new cut to that texture. Image 2 supplies silhouette, length, layering, fringe and parting only. Do not replace curly or coily hair with straight or spiky hair unless a texture change was requested.";
  if (!texture || texture === "natural") return keep;
  return `${keep} A texture change was requested: the hair texture should be ${texture}, adapted to the head in Image 1. Image 2 does not supply that texture.`;
}

/** Reference-mode prompt. No mask sentences. Image 1 is the person. Image 2 is the haircut only. */
export function buildReferencePrompt(style: StyleDef, colourName?: string, texture?: AskedTexture) {
  const colour = colourName
    ? `A colour change was requested: shift the hair colour toward ${colourName}.`
    : "Keep the original hair colour unless a colour change was requested.";
  return [
    "Image 1 is the person to edit. Image 2 is a hairstyle reference only.",
    `Produce one photorealistic edited photograph of the person in Image 1 wearing ${style.name}. ${style.prompt}`,
    "Transfer the haircut's silhouette, length, layering, fringe and parting from Image 2, adapted naturally to the person's head and existing hair texture.",
    textureInstruction(texture),
    "Preserve the identity, facial features, expression, pose, head size, camera position, clothing, jewellery, background and lighting from Image 1.",
    "Keep the clothing, neckline shape, collar, sleeves, garment colour and straps exactly as in Image 1. If Image 1 shows a crew-neck t-shirt, the t-shirt keeps its exact crew neckline. Only the hair region, and skin or background that the old hair was covering, may change.",
    colour,
    "Do not transfer the reference person's face, skin, clothing, pose or background.",
    lengthInstruction(style),
    "Remove original hair that conflicts with the new cut and plausibly reconstruct exposed background, neck or clothing.",
    "Keep natural strands, hairline, shadows and occlusion.",
    "Return the complete edited photograph without text or a collage.",
  ].join(" ");
}

/** Guest brow edit. Image 2 is a shape diagram. No mask sentence. */
export function buildBrowPrompt(brow: BrowDef, variation?: BrowVariation) {
  const thickness = parseBrowThickness(variation?.thickness);
  const colour = parseBrowColour(variation?.colour);
  return [
    "Image 1 is the customer selfie. Image 2 is a brow-shape diagram, not a face to copy.",
    "Change only the eyebrows.",
    "Keep the face, identity, hair, skin, background and framing identical.",
    `The selected brow is ${brow.name}. ${brow.prompt}`,
    browThicknessLine(thickness),
    browColourLine(colour),
  ].join(" ");
}

/** Guest beard edit. Image 2 is the beard photo. Clean Shave still follows image 2. */
export function buildBeardPrompt(beard: BeardDef) {
  return [
    IMAGE_ROLES,
    "Change only the facial hair (beard, moustache, stubble) to match image 2.",
    "Keep the lips, mouth shape, teeth, nose, jaw, skin, hair, clothes and background the same.",
    "'Clean Shave' removes the facial hair.",
    "If the person is a woman or has no facial hair, still follow image 2 and keep the face the same.",
    `The selected beard is ${beard.name}. ${beard.prompt}`,
  ].join(" ");
}

/** Guest colour edit. Image 2 is a flat swatch of the selected shade. */
export function buildColourPrompt(shade: ShadeDef) {
  return [
    IMAGE_ROLES,
    `Recolour the existing hair to the selected shade. The selected shade is ${shade.name}.`,
    "Keep the haircut, length, style and everything else the same.",
  ].join(" ");
}

/** Full bridal look. Image 2 is a look reference when one exists. The face in image 1 stays the bride. */
export function buildBridalPrompt(
  look: BridalLook,
  finish: BridalFinish,
  lip: BridalLip,
  live?: { kajal?: boolean; lashes?: boolean; blush?: boolean; brow?: boolean; makeup?: string; hair?: string },
) {
  const marks = [
    live?.kajal ? "kajal on" : "kajal off",
    live?.lashes ? "lashes on" : "lashes off",
    live?.blush ? "blush on" : "blush off",
    live?.brow ? "brow tint on" : "brow tint off",
  ];
  return [
    "Image 1 is the bride's selfie. Image 2 is a bridal look reference. Do not copy the reference person's face.",
    `Apply one full look: hair, makeup, bindi, and jewellery together. The look is ${look.name}. ${look.prompt}`,
    finish.prompt,
    `Lip colour: ${lip.name}.`,
    live?.makeup || "",
    live?.hair || "",
    `The live mirror choices were ${marks.join(", ")}. Paint those on the real portrait. This is a full look, not a camera filter.`,
    "Keep the same person: identity, skin tone, age, and expression.",
    "A portrait, photorealistic, with natural light. No text, logos, watermarks, or extra people.",
    "This is a salon trial preview, not a guarantee of the finished makeup.",
  ].filter(Boolean).join(" ");
}

/** Mehendi on the hand in image 1. */
export function buildMehendiPrompt(style: MehendiOption, coverage: MehendiOption, shade: MehendiOption, density: MehendiOption) {
  return [
    "Image 1 is a photo of the customer's hand.",
    `Add ${style.label} mehendi. Coverage: ${coverage.label}. Shade: ${shade.label}. Density: ${density.label}.`,
    "Keep the hand, skin tone, nails, and background. Only add the henna stain.",
    "Photorealistic. No text, logos, or extra objects.",
  ].join(" ");
}

/** Guest nail edit. Image 2 is the nail photo. No mask sentence. */
export function buildNailPrompt(nail: NailDef) {
  return [
    IMAGE_ROLES,
    "Change only the polish or art on the visible fingernails to match image 2.",
    "Keep the fingers, nail length, nail shape, skin, jewellery, clothes and background the same.",
    `The selected design is ${nail.name}. ${nail.prompt}`,
  ].join(" ");
}
