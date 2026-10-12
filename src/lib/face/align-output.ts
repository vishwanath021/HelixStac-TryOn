import { applySimilarity, fitSimilarity, invertSimilarity, type Point, type Similarity } from "@/lib/face/similarity";

/** Person's right outer, right inner, left inner, left outer. */
export const EYE_CORNER_INDEXES = [33, 133, 362, 263] as const;
export const NOSE_TIP_INDEX = 1;
export const MOUTH_CORNER_INDEXES = [61, 291] as const;

/** Eye corners, nose tip, and mouth corners. A beard edit drops the mouth, which the edit changes. */
export function alignAnchorIndexes(beard: boolean): number[] {
  const eyesAndNose = [...EYE_CORNER_INDEXES, NOSE_TIP_INDEX];
  return beard ? eyesAndNose : [...eyesAndNose, ...MOUTH_CORNER_INDEXES];
}

export function pixelPoints(
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  indexes: readonly number[],
): Point[] | null {
  if (!indexes.length || width < 1 || height < 1) return null;
  const points: Point[] = [];
  for (const index of indexes) {
    const point = landmarks[index];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    points.push({ x: point.x * width, y: point.y * height });
  }
  return points;
}

export type CoverFit = { scale: number; offsetX: number; offsetY: number };

/** object-fit: cover, centred. Scale is how source pixels grow onto the destination canvas. */
export function coverFit(srcW: number, srcH: number, dstW: number, dstH: number): CoverFit {
  const scale = Math.max(dstW / Math.max(1, srcW), dstH / Math.max(1, srcH));
  const drawnW = srcW * scale;
  const drawnH = srcH * scale;
  return {
    scale,
    offsetX: (dstW - drawnW) / 2,
    offsetY: (dstH - drawnH) / 2,
  };
}

/** Maps a generated pixel onto the original canvas with centred cover. */
export function coverSimilarity(srcW: number, srcH: number, dstW: number, dstH: number): Similarity {
  const fit = coverFit(srcW, srcH, dstW, dstH);
  return { a: fit.scale, b: 0, tx: fit.offsetX, ty: fit.offsetY };
}

export function similarityOrCover(args: {
  generated: Point[] | null;
  original: Point[] | null;
  srcW: number;
  srcH: number;
  dstW: number;
  dstH: number;
}): { sim: Similarity; mode: "landmarks" | "cover" } {
  const { generated, original } = args;
  if (generated && original && generated.length === original.length && generated.length >= 2) {
    try {
      return { sim: fitSimilarity(generated, original), mode: "landmarks" };
    } catch {
      /* Degenerate landmarks use the cover crop. */
    }
  }
  return {
    sim: coverSimilarity(args.srcW, args.srcH, args.dstW, args.dstH),
    mode: "cover",
  };
}

export function meanPointDistance(left: Point[], right: Point[]) {
  if (!left.length || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < left.length; i += 1) {
    sum += Math.hypot(left[i].x - right[i].x, left[i].y - right[i].y);
  }
  return sum / left.length;
}

function sampleRgba(src: Uint8Array | Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const dx = x - x0;
  const dy = y - y0;
  const at = (px: number, py: number) => {
    const cx = Math.max(0, Math.min(width - 1, px));
    const cy = Math.max(0, Math.min(height - 1, py));
    const i = (cy * width + cx) * 4;
    return [src[i], src[i + 1], src[i + 2], src[i + 3]] as const;
  };
  const a = at(x0, y0);
  const b = at(x0 + 1, y0);
  const c = at(x0, y0 + 1);
  const d = at(x0 + 1, y0 + 1);
  const mix = (index: number) => {
    const top = a[index] * (1 - dx) + b[index] * dx;
    const bottom = c[index] * (1 - dx) + d[index] * dx;
    return Math.max(0, Math.min(255, Math.round(top * (1 - dy) + bottom * dy)));
  };
  return [mix(0), mix(1), mix(2), mix(3)] as const;
}

/**
 * Inverse-map each original-canvas pixel into the generated image.
 * Samples outside the frame clamp to the generated edge. The original photo is not an input.
 */
export function warpRgba(
  src: Uint8Array | Uint8ClampedArray,
  srcW: number,
  srcH: number,
  generatedToOriginal: Similarity,
  dstW: number,
  dstH: number,
) {
  const inverse = invertSimilarity(generatedToOriginal);
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  for (let y = 0; y < dstH; y += 1) {
    for (let x = 0; x < dstW; x += 1) {
      const source = applySimilarity(inverse, { x: x + 0.5, y: y + 0.5 });
      const [r, g, b, a] = sampleRgba(src, srcW, srcH, source.x - 0.5, source.y - 0.5);
      const o = (y * dstW + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }
  }
  return out;
}
