/**
 * Hair colour may land only on hair.
 * Confidence ≥ 0.6, then the face oval and face-skin are punched out,
 * the mask is eroded, and a short blur feathers the edge.
 */

import { FACE_OVAL } from "@/lib/face/landmarks";
import type { Pt } from "@/lib/face/makeup-paint";
import { erodeMask, fillPolygon } from "@/lib/face/raster";

/** Mix strength for a luminosity-preserving dye. Not a flat fill. */
export const HAIR_BLEND = 0.5;
const HAIR_CONFIDENCE = 0.6;
const FACE_SKIN_CONFIDENCE = 0.35;
const HAIR_CLASS = 1;
const BODY_SKIN_CLASS = 2;
const FACE_SKIN_CLASS = 3;

export type HairMaskInput = {
  width: number;
  height: number;
  category: Uint8Array | null;
  /** Class 1, 0–1 (or 0–255). Null when the segmenter only returned categories. */
  hairConf: Float32Array | null;
  /** Class 3, same scale as hairConf. */
  faceSkinConf: Float32Array | null;
  points: Pt[] | null;
};

function unit(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 255 : value;
}

function boxBlur(src: Uint8Array, width: number, height: number, radius: number) {
  if (radius <= 0) return Uint8Array.from(src);
  const horizontal = new Float32Array(src.length);
  const out = new Uint8Array(src.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const xx = x + k;
        if (xx < 0 || xx >= width) continue;
        sum += src[row + xx] ?? 0;
        count += 1;
      }
      horizontal[row + x] = count ? sum / count : 0;
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const yy = y + k;
        if (yy < 0 || yy >= height) continue;
        sum += horizontal[yy * width + x] ?? 0;
        count += 1;
      }
      out[y * width + x] = count ? Math.round(sum / count) : 0;
    }
  }
  return out;
}

/** RGBA: R = feathered hair alpha, G = skin for lips and blush, A = 255. */
export function buildHairMask(input: HairMaskInput) {
  const { width, height } = input;
  const count = width * height;
  const hard = new Uint8Array(count);
  const skin = new Uint8Array(count);
  const oval = new Uint8Array(count);
  const points = input.points;
  if (points && points.length > 400) {
    fillPolygon(
      oval,
      width,
      height,
      FACE_OVAL.map((index) => {
        const point = points[index];
        return { x: (point?.x ?? 0) * width, y: (point?.y ?? 0) * height };
      }),
    );
  }
  for (let i = 0; i < count; i += 1) {
    const category = input.category?.[i] ?? -1;
    const hairScore = input.hairConf ? unit(input.hairConf[i] ?? 0) : category === HAIR_CLASS ? 1 : 0;
    const faceSkinScore = input.faceSkinConf ? unit(input.faceSkinConf[i] ?? 0) : category === FACE_SKIN_CLASS ? 1 : 0;
    const faceSkin = faceSkinScore >= FACE_SKIN_CONFIDENCE || category === FACE_SKIN_CLASS;
    if (category === BODY_SKIN_CLASS || category === FACE_SKIN_CLASS) skin[i] = 255;
    if (hairScore < HAIR_CONFIDENCE || faceSkin || oval[i]) continue;
    if (input.category && category !== HAIR_CLASS && hairScore < 0.85) continue;
    hard[i] = 255;
  }
  const erodeR = Math.max(2, Math.round(width / 96));
  const featherR = Math.max(1, Math.round(erodeR * 0.66));
  const eroded = erodeMask(hard, width, height, erodeR);
  const feathered = boxBlur(eroded, width, height, featherR);
  const packed = new Uint8Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const blocked = oval[i] || (input.faceSkinConf ? unit(input.faceSkinConf[i] ?? 0) >= FACE_SKIN_CONFIDENCE : input.category?.[i] === FACE_SKIN_CLASS);
    packed[i * 4] = blocked ? 0 : feathered[i] ?? 0;
    packed[i * 4 + 1] = skin[i] ?? 0;
    packed[i * 4 + 3] = 255;
  }
  return packed;
}
