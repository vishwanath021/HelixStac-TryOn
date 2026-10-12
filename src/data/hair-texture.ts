/** Texture of a catalogue reference photo, not the texture a client can wear. */
export type ReferenceTexture = "straight" | "wavy" | "curly";

/**
 * beach-waves and soft-waves are loose S-waves. soft-curls, curly-top-fade and
 * kids-curly-crop are straight in the file, despite the name.
 */
const WAVY_REFERENCES = new Set(["beach-waves", "soft-waves"]);

export function referenceTextureFor(style: { id?: string; referenceTexture?: ReferenceTexture }): ReferenceTexture {
  if (style.referenceTexture) return style.referenceTexture;
  if (style.id && WAVY_REFERENCES.has(style.id)) return "wavy";
  return "straight";
}
