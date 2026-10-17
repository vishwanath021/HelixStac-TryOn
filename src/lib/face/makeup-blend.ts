/**
 * Numbers shared with the live shader in live-gl.ts.
 * Blush is a Gaussian. Its steepest 1px step stays under 0.02 alpha.
 */

export const BLUSH_RADIUS_OF_FACE = 0.18;
export const BLUSH_PEAK_ALPHA = 0.18;

/** Everyday live look. The eye-whites check uses these numbers. */
export const EVERYDAY_LIVE = {
  lipMix: 0.55,
  /** How far the lip blend moves from soft-light toward multiply. */
  lipBody: 0.5,
  /** How far lipstick lightness follows the skin. Webcam keeps the chosen hue. */
  lipAdapt: 0.45,
  lipFeather: 6,
  blushPeak: BLUSH_PEAK_ALPHA,
  browMix: 0.25,
  kajalMix: 0.6,
  kajalIod: 0.02,
  kajalMax: 2.5,
  wing: 0.12,
};

/** Bridal live look. Stronger colour, still outside the eye opening. */
export const BRIDAL_LIVE = {
  lipMix: 0.7,
  lipBody: 0.55,
  lipAdapt: 0.35,
  lipFeather: 6,
  blushPeak: 0.28,
  browMix: 0.48,
  kajalMix: 0.85,
  kajalIod: 0.045,
  kajalMax: 4,
  wing: 0.28,
};

export type LiveIntensity = typeof EVERYDAY_LIVE;

/**
 * Webcam preview. Lips stay readable at a small mouth: a short feather,
 * little skin matching, and a multiply-heavy blend. Kajal and blush stay soft.
 * Brows stay off. Live has no lash layer.
 */
export const CAMERA_LIVE = {
  lipMix: 0.9,
  lipBody: 0.82,
  lipAdapt: 0.12,
  lipFeather: 2,
  blushPeak: 0.16,
  browMix: 0,
  kajalMix: 0.42,
  kajalIod: 0.018,
  kajalMax: 2.2,
  wing: 0.08,
};

export function livePreset(bridal?: boolean, camera = false): LiveIntensity {
  if (camera) return CAMERA_LIVE;
  return bridal ? BRIDAL_LIVE : EVERYDAY_LIVE;
}

/** Lip and eye edges fade across this many pixels instead of a hard cut. */
export const LIP_FEATHER_PX = 6;
export const EYE_FEATHER_PX = 4;

/**
 * Keep the chosen hue and sit its lightness on the sampled skin.
 * `mix` is how far the colour moves toward the skin's luminance.
 */
export function adaptMakeupRgb(
  ink: [number, number, number],
  skin: [number, number, number],
  mix = 0.45,
): [number, number, number] {
  const y = (rgb: [number, number, number]) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const skinY = Math.max(y(skin), 0.04);
  const inkY = Math.max(y(ink), 0.04);
  const scale = (1 - mix) + mix * (skinY / inkY);
  return [
    Math.min(1, Math.max(0, ink[0] * scale)),
    Math.min(1, Math.max(0, ink[1] * scale)),
    Math.min(1, Math.max(0, ink[2] * scale)),
  ];
}
export const BLUSH_SIGMA_DIV = 2.5;
/** Floor so a small face cannot turn the wash into a hard disc. */
export const BLUSH_MIN_SIGMA_PX = 6;

export function blushSigmaPx(faceWidthPx: number) {
  const radius = Math.max(0, faceWidthPx) * BLUSH_RADIUS_OF_FACE;
  return Math.max(radius / BLUSH_SIGMA_DIV, BLUSH_MIN_SIGMA_PX);
}

export function blushAlpha(distancePx: number, faceWidthPx: number) {
  const sigma = blushSigmaPx(faceWidthPx);
  const x = distancePx / sigma;
  return BLUSH_PEAK_ALPHA * Math.exp(-0.5 * x * x);
}

/** Kajal width in pixels. Everyday stays 1–2.5px. Bridal is wider and still clamped. */
export function kajalWidthPx(iodPx: number, bridal = false) {
  const preset = livePreset(bridal);
  if (!Number.isFinite(iodPx) || iodPx <= 0) return 1;
  return Math.min(preset.kajalMax, Math.max(1, iodPx * preset.kajalIod));
}

export const LINER_BLUR_PX = 1.5;
export const LINER_MULTIPLY = 0.6;
/** The outer third stays at full width. Past that the stroke thins to nothing at the inner corner. */
export const LINER_OUTER_SHARE = 0.33;

export type Px = { x: number; y: number };

/**
 * s = 0 at the outer corner, s = 1 at the inner corner, s = -1 at the wing tip.
 * Width is zero at both the inner corner and the wing tip, so the two lids never meet into a ring.
 */
export function linerProfile(s: number, maxWidthPx: number) {
  if (!Number.isFinite(s) || s <= -1 || s >= 1) return 0;
  if (s < 0) return maxWidthPx * (1 + s);
  if (s <= LINER_OUTER_SHARE) return maxWidthPx;
  return maxWidthPx * ((1 - s) / (1 - LINER_OUTER_SHARE));
}

/** 1 inside the stroke, falling to 0 across `blurPx`. */
export function strokeCover(distancePx: number, widthPx: number, blurPx = LINER_BLUR_PX) {
  if (widthPx <= 0 || distancePx < 0) return 0;
  const half = widthPx * 0.5;
  const outer = half + blurPx;
  if (distancePx >= outer) return 0;
  if (distancePx <= half) return 1;
  const x = (outer - distancePx) / blurPx;
  return x * x * (3 - 2 * x);
}

function project(p: Px, a: Px, b: Px) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const denom = abx * abx + aby * aby || 1e-6;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / denom));
  const x = a.x + abx * t;
  const y = a.y + aby * t;
  return { d: Math.hypot(p.x - x, p.y - y), t, len: Math.hypot(abx, aby) };
}

/** Closest point on an open lid. Index 0 is the outer corner. A short wing continues past it. */
export function linerQuery(p: Px, line: readonly Px[], wingPx: number) {
  let total = 0;
  const lengths: number[] = [];
  for (let i = 0; i < line.length - 1; i += 1) {
    const len = Math.hypot(line[i + 1]!.x - line[i]!.x, line[i + 1]!.y - line[i]!.y);
    lengths.push(len);
    total += len;
  }
  let bestD = Number.POSITIVE_INFINITY;
  let bestS = 1;
  let walked = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    const hit = project(p, line[i]!, line[i + 1]!);
    if (hit.d < bestD) {
      bestD = hit.d;
      bestS = (walked + hit.t * lengths[i]!) / (total || 1);
    }
    walked += lengths[i]!;
  }
  const outer = line[0]!;
  const next = line[1] ?? outer;
  const dx = outer.x - next.x;
  const dy = outer.y - next.y;
  const mag = Math.hypot(dx, dy) || 1;
  const tip = { x: outer.x + (dx / mag) * wingPx, y: outer.y + (dy / mag) * wingPx };
  const wing = project(p, tip, outer);
  if (wing.d < bestD) {
    bestD = wing.d;
    bestS = wing.t - 1;
  }
  return { distance: bestD, s: bestS };
}

export function eyelinerAlpha(p: Px, line: readonly Px[], maxWidthPx: number, wingPx: number) {
  const hit = linerQuery(p, line, wingPx);
  return strokeCover(hit.distance, linerProfile(hit.s, maxWidthPx), LINER_BLUR_PX);
}

function insideLoop(p: Px, loop: readonly Px[]) {
  let hit = false;
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    const up = a.y > p.y !== b.y > p.y;
    if (!up) continue;
    const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 1e-6) + a.x;
    if (p.x < x) hit = !hit;
  }
  return hit;
}

/** Upper lid outer-to-inner, then the lower lid back. Alpha is 0 inside the opening. */
export function eyelinerAt(p: Px, upper: readonly Px[], lower: readonly Px[], maxWidthPx: number, wingPx: number) {
  const loop = [...upper, ...[...lower].reverse().slice(1, -1)];
  if (insideLoop(p, loop)) return 0;
  return Math.max(eyelinerAlpha(p, upper, maxWidthPx, wingPx), eyelinerAlpha(p, lower, maxWidthPx, wingPx));
}

export function pointOnLine(line: readonly Px[], s: number): Px {
  let total = 0;
  const lengths: number[] = [];
  for (let i = 0; i < line.length - 1; i += 1) {
    const len = Math.hypot(line[i + 1]!.x - line[i]!.x, line[i + 1]!.y - line[i]!.y);
    lengths.push(len);
    total += len;
  }
  let remain = Math.min(1, Math.max(0, s)) * total;
  for (let i = 0; i < lengths.length; i += 1) {
    const len = lengths[i]!;
    if (remain <= len || i === lengths.length - 1) {
      const t = len ? remain / len : 0;
      const a = line[i]!;
      const b = line[i + 1]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remain -= len;
  }
  return line[line.length - 1]!;
}

export type LookAudience = "women" | "men" | "kids";

export type LiveEffectFlags = {
  lip: string | null;
  kajal: boolean;
  blush: boolean;
  brow: boolean;
  hair: string | null;
};

/** Men’s live styling is hair and beard. Makeup stays off unless a bridal look asks for it. */
export function liveEffectsFor<T extends LiveEffectFlags>(audience: LookAudience | undefined, effects: T): T {
  if (audience !== "men") return effects;
  return { ...effects, lip: null, kajal: false, blush: false, brow: false };
}
