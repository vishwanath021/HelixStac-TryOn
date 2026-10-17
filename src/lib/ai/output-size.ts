/**
 * gpt-image-2.5 accepts WIDTHxHEIGHT when both edges are multiples of 16,
 * the long edge is at most 3× the short edge, and the pixel count is in range.
 * 1024×1360 is the 3:4 portrait. Other rows are the same rule for common selfie shapes.
 * A photo that is not within 2% of one of these ratios is padded into the nearest
 * canvas and cropped back with restoreFrame.
 */
export const COMMON_OUTPUT_FRAMES = [
  { size: "1024x1024", width: 1024, height: 1024 },
  { size: "1024x1360", width: 1024, height: 1360 },
  { size: "1360x1024", width: 1360, height: 1024 },
  { size: "1024x1280", width: 1024, height: 1280 },
  { size: "1280x1024", width: 1280, height: 1024 },
  { size: "1024x1536", width: 1024, height: 1536 },
  { size: "1536x1024", width: 1536, height: 1024 },
  { size: "1024x1824", width: 1024, height: 1824 },
  { size: "1824x1024", width: 1824, height: 1024 },
] as const;

export type CommonOutputSize = (typeof COMMON_OUTPUT_FRAMES)[number]["size"];

const RATIO_SLACK = 0.02;

export function matchSelfieOutput(width: number, height: number) {
  const ratio = width / Math.max(1, height);
  let best: (typeof COMMON_OUTPUT_FRAMES)[number] = COMMON_OUTPUT_FRAMES[0];
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const frame of COMMON_OUTPUT_FRAMES) {
    const delta = Math.abs(frame.width / frame.height - ratio) / Math.max(ratio, 1e-6);
    if (delta < bestDelta) {
      best = frame;
      bestDelta = delta;
    }
  }
  return { size: best.size, width: best.width, height: best.height, exact: bestDelta <= RATIO_SLACK };
}

/** Legal custom size for gpt-image-2 and gpt-image-2.5. */
export function isFlexibleOutputSize(size: string) {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width % 16 !== 0 || height % 16 !== 0 || width < 16 || height < 16) return false;
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long > 3840 || long / short > 3) return false;
  const pixels = width * height;
  return pixels >= 655_360 && pixels <= 8_294_400;
}
