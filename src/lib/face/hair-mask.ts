/**
 * Hair colour lands only on segmenter hair, and only inside the dilated
 * region above the brow line. Skin, eyes, and the background stay untouched.
 * Confidence ≥ 0.42 so a dim strand still counts. Small holes are closed,
 * then the edge is feathered.
 */

import { EAR_LEFT, EAR_RIGHT, FACE_OVAL, LEFT_BROW, LEFT_EYE, RIGHT_BROW, RIGHT_EYE } from "@/lib/face/landmarks";
import type { Pt } from "@/lib/face/makeup-paint";
import { dilateMask, erodeMask, fillPolygon } from "@/lib/face/raster";

/** Mix strength for a luminosity-preserving dye. Not a flat fill. */
export const HAIR_BLEND = 0.5;
/** Below this the segmenter is guessing. 0.42 keeps a night-time half that scores under 0.6. */
export const HAIR_CONFIDENCE = 0.42;
/** Pixels this close to hair are filled, then the outline is restored. */
const HOLE_RADIUS = 2;
/** Near-black hair is lifted only up to this luma so the dye stays visible. */
export const HAIR_LUMA_LIFT = 0.28;
export const HAIR_LUMA_LIFT_START = 0.05;
export const HAIR_LUMA_LIFT_END = 0.35;
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
  /** Photo colours in mask resolution, RGBA. Used to reject a smooth bald scalp. */
  rgb?: Uint8ClampedArray | Uint8Array | null;
};

function unit(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 255 : value;
}

/** Hermite smoothstep, matching the live shader. */
function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

/**
 * Luma used when recolouring hair. Very dark hair is lifted toward 0.28
 * so a night photo still shows the dye. Hair that is already mid-tone keeps its luma.
 */
export function liftHairLuma(luma: number) {
  const t = smoothstep(HAIR_LUMA_LIFT_START, HAIR_LUMA_LIFT_END, luma);
  return HAIR_LUMA_LIFT * (1 - t) + luma * t;
}

/** Dark or textured hair, including a lit patch on otherwise dark hair. A smooth light scalp stays skin. */
export function pixelIsHair(rgb: Uint8ClampedArray | Uint8Array, width: number, height: number, index: number) {
  const x = index % width;
  const y = Math.floor(index / width);
  const at = (xx: number, yy: number) => {
    const p = (yy * width + xx) * 4;
    const r = rgb[p] ?? 0;
    const g = rgb[p + 1] ?? 0;
    const b = rgb[p + 2] ?? 0;
    return { r, g, b, luma: 0.2126 * r + 0.7152 * g + 0.0722 * b };
  };
  const here = at(x, y);
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const luma = at(xx, yy).luma;
      sum += luma;
      sumSq += luma * luma;
      n += 1;
    }
  }
  const mean = n ? sum / n : here.luma;
  const variance = n ? Math.max(0, sumSq / n - mean * mean) : 0;
  const max = Math.max(here.r, here.g, here.b);
  const min = Math.min(here.r, here.g, here.b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (here.luma < 96 && sat < 0.72) return true;
  if (variance > 260 && here.luma < 150) return true;
  return false;
}

const FOREHEAD = 10;
const CHIN = 152;

/** Box above the brows, grown a little so a fringe is included. Eyes are marked separately. */
export function hairGate(points: Pt[] | null, width: number, height: number) {
  const count = width * height;
  const allow = new Uint8Array(count);
  const eyes = new Uint8Array(count);
  if (!points || points.length < 468) return { allow, eyes, ready: false };
  const brows = [...LEFT_BROW, ...RIGHT_BROW].map((index) => points[index]).filter((point): point is Pt => Boolean(point));
  const forehead = points[FOREHEAD];
  const chin = points[CHIN];
  const earL = points[EAR_LEFT];
  const earR = points[EAR_RIGHT];
  if (brows.length < 4 || !forehead || !chin || !earL || !earR) return { allow, eyes, ready: false };
  const browY = Math.min(...brows.map((point) => point.y));
  const faceH = Math.max(0.08, Math.abs(chin.y - forehead.y));
  const left = Math.max(0, Math.min(earL.x, earR.x) - faceH * 0.35);
  const right = Math.min(1, Math.max(earL.x, earR.x) + faceH * 0.35);
  const top = 0;
  fillPolygon(allow, width, height, [
    { x: left * width, y: browY * height },
    { x: left * width, y: top },
    { x: right * width, y: top },
    { x: right * width, y: browY * height },
  ]);
  const grown = dilateMask(allow, width, height, Math.max(2, Math.round(width / 40)));
  for (const loop of [LEFT_EYE, RIGHT_EYE]) {
    fillPolygon(
      eyes,
      width,
      height,
      loop.map((index) => {
        const point = points[index];
        return { x: (point?.x ?? 0) * width, y: (point?.y ?? 0) * height };
      }),
    );
  }
  return { allow: grown, eyes, ready: true };
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
  const gate = hairGate(points, width, height);
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
    if (!gate.ready || !gate.allow[i] || gate.eyes[i]) continue;
    if (hairScore < HAIR_CONFIDENCE || faceSkin || category === BODY_SKIN_CLASS || oval[i]) continue;
    if (input.category && category !== HAIR_CLASS) continue;
    if (input.rgb && input.rgb.length >= count * 4 && !pixelIsHair(input.rgb, width, height, i)) continue;
    hard[i] = 255;
  }
  const closed = erodeMask(dilateMask(hard, width, height, HOLE_RADIUS), width, height, HOLE_RADIUS);
  const blockedAt = (index: number) => {
    const faceSkinScore = input.faceSkinConf ? unit(input.faceSkinConf[index] ?? 0) : input.category?.[index] === FACE_SKIN_CLASS ? 1 : 0;
    return !gate.allow[index] || gate.eyes[index] || oval[index] || faceSkinScore >= FACE_SKIN_CONFIDENCE;
  };
  for (let i = 0; i < count; i += 1) {
    if (blockedAt(i)) closed[i] = 0;
  }
  const erodeR = Math.max(2, Math.round(width / 96));
  const featherR = Math.max(1, Math.round(erodeR * 0.66));
  const eroded = erodeMask(closed, width, height, erodeR);
  const feathered = boxBlur(eroded, width, height, featherR);
  const packed = new Uint8Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    packed[i * 4] = blockedAt(i) ? 0 : feathered[i] ?? 0;
    packed[i * 4 + 1] = skin[i] ?? 0;
    packed[i * 4 + 3] = 255;
  }
  return packed;
}
