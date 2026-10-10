import sharp from "sharp";
import type { GenerateOutput } from "@/lib/ai/types";

/** Deterministic edit that recolours every pixel. The region lock has to put the original back. */
export async function paintFlat(image: Buffer, color: { r: number; g: number; b: number } = { r: 255, g: 0, b: 128 }): Promise<GenerateOutput> {
  const meta = await sharp(image).metadata();
  const painted = await sharp({
    create: { width: meta.width || 8, height: meta.height || 8, channels: 3, background: color },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
  return { image: painted, mime: "image/jpeg", provider: "flat", providerCostUsd: 0, latencyMs: 0 };
}
