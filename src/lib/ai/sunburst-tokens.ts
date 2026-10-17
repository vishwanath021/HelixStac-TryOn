import type { EditQuality } from "@/lib/ai/edit-request";

/**
 * GPT Image 2.5 token estimates for Sunburst and Flare.
 *
 * A live medium 1024×1360 edit on 17 Oct 2026 billed 397 text-input tokens,
 * 2,400 image-input tokens and 367 output tokens, which is $0.032195 at the
 * published rates (text input $5/1M, image input $8/1M, image output $30/1M).
 * The previous quote used the gpt-image-1.5 table and came out at ₹14.90.
 *
 * Image input is 400 tokens per 512×512 tile of the output frame.
 * 1024×1360 is 2×3 tiles = 2,400, the live count. That edit also sent a
 * reference, and the bill did not add a separate tile for it.
 *
 * Output tokens start from the published 1024×1024 cells and scale with
 * sqrt(square area / this area). Larger frames can cost fewer output tokens.
 * 1024×1360 medium lands on 381 against the live 367 (about 4%).
 * 1536×1024 medium lands on 358 against the published 343 (about 4%).
 */
export const SUNBURST_TEXT_INPUT_TOKENS = 400;

const SQUARE = 1024;
const OUTPUT_AT_SQUARE: Record<EditQuality, number> = {
  low: 196,
  medium: 439,
  high: 1756,
};

export function sunburstOutputTokens(quality: EditQuality, width: number, height: number) {
  const area = Math.max(1, width) * Math.max(1, height);
  const scale = Math.sqrt((SQUARE * SQUARE) / area);
  return Math.max(1, Math.round(OUTPUT_AT_SQUARE[quality] * scale));
}

export function sunburstImageInputTokens(width: number, height: number) {
  const tilesWide = Math.ceil(Math.max(1, width) / 512);
  const tilesHigh = Math.ceil(Math.max(1, height) / 512);
  return tilesWide * tilesHigh * 400;
}
