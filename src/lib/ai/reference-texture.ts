import { referenceTextureFor, type ReferenceTexture } from "@/data/hair-texture";

export type AskedTexture = "natural" | "straight" | "wavy" | "curly";

export function parseAskedTexture(value: string): AskedTexture {
  if (value === "straight" || value === "wavy" || value === "curly") return value;
  return "natural";
}

/** Dedup mode. Natural stays `reference` or `reference-hair`. A set texture is appended. */
export function referenceFingerprintMode(hairComposite: boolean, asked: AskedTexture) {
  const base = hairComposite ? "reference-hair" : "reference";
  return asked === "natural" ? base : `${base}-${asked}`;
}

export type ReferenceChoice = {
  fileName: string;
  referenceTexture: ReferenceTexture;
  asked: AskedTexture;
  mismatch: boolean;
  warning: string;
};

/**
 * Image 2 stays the selected cut. A `{id}-curly.jpg` or `{id}-wavy.jpg` sibling is
 * used when it is already on disk. Otherwise the shipped JPEG stays, and a curly
 * or wavy request warns when that JPEG is a different texture.
 */
export function selectReferenceVariant(args: {
  styleId: string;
  styleName: string;
  referenceTexture?: ReferenceTexture;
  asked: AskedTexture;
  files: string[];
}): ReferenceChoice {
  const referenceTexture = referenceTextureFor({ id: args.styleId, referenceTexture: args.referenceTexture });
  const standard = `${args.styleId}.jpg`;
  if (args.asked === "natural") {
    return { fileName: standard, referenceTexture, asked: args.asked, mismatch: false, warning: "" };
  }
  const variant = `${args.styleId}-${args.asked}.jpg`;
  if (args.files.includes(variant)) {
    return { fileName: variant, referenceTexture: args.asked, asked: args.asked, mismatch: false, warning: "" };
  }
  if (referenceTexture === args.asked) {
    return { fileName: standard, referenceTexture, asked: args.asked, mismatch: false, warning: "" };
  }
  return {
    fileName: standard,
    referenceTexture,
    asked: args.asked,
    mismatch: true,
    warning: `The ${args.styleName} reference is ${referenceTexture} hair. No ${args.asked} variant is in the catalogue, so Image 2 can still pull the cut toward that ${referenceTexture} texture. The prompt keeps texture from Image 1.`,
  };
}

export function stylesMissingCurlyReference(styles: { id: string; name: string; referenceTexture?: ReferenceTexture }[], files: string[]) {
  return styles
    .filter((style) => {
      const texture = referenceTextureFor(style);
      return texture !== "curly" && !files.includes(`${style.id}-curly.jpg`);
    })
    .map((style) => style.id);
}
