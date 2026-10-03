import type { BeardDef } from "@/data/beards";
import type { BrowDef } from "@/data/brows";
import type { NailDef } from "@/data/nails";
import type { StyleDef } from "@/data/styles";

export function buildStylePrompt(style: StyleDef, colourName?: string) {
  return [
    `Edit the person's hair only. New hairstyle: ${style.name}.`,
    style.prompt,
    colourName
      ? `Shift the hair colour toward ${colourName}. Keep it believable on the hair already in the photo.`
      : "Keep the current hair colour, except where the haircut changes how light falls.",
    "Keep the same person: identity, face, facial features, skin tone, expression, age, gender presentation, clothing, jewellery, background, lighting, camera angle, and pose must stay unchanged.",
    "Do not add or remove people. Do not add text, logos, or watermarks. Photorealistic. Respect the Indian hair texture already visible: straight, wavy, curly, thick, or thin.",
    "The result is a salon consultation preview, not a guarantee of the finished cut.",
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
