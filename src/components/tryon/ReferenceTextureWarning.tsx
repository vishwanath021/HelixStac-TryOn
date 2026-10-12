import type { ReferenceTexture } from "@/data/hair-texture";
import { selectReferenceVariant, type AskedTexture } from "@/lib/ai/reference-texture";

/** Shown in reference mode when Image 2's texture does not match the requested one. */
export function ReferenceTextureWarning({
  styleId,
  styleName,
  referenceTexture,
  asked,
}: {
  styleId: string;
  styleName: string;
  referenceTexture?: ReferenceTexture;
  asked: AskedTexture;
}) {
  if (!styleId || asked === "natural") return null;
  const choice = selectReferenceVariant({
    styleId,
    styleName,
    referenceTexture,
    asked,
    files: [`${styleId}.jpg`],
  });
  if (!choice.warning) return null;
  return <p className="mt-2 text-amber-900" role="status">{choice.warning}</p>;
}
