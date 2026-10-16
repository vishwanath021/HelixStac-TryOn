/**
 * Numbers shared with the live shader in live-gl.ts.
 * Blush is a Gaussian. Its steepest 1px step stays under 0.02 alpha.
 */

export const BLUSH_RADIUS_OF_FACE = 0.18;
export const BLUSH_PEAK_ALPHA = 0.18;
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

/** Kajal width in pixels, scaled by the inter-ocular distance and clamped to 1–2.5px. */
export function kajalWidthPx(iodPx: number) {
  if (!Number.isFinite(iodPx) || iodPx <= 0) return 1;
  return Math.min(2.5, Math.max(1, iodPx * 0.02));
}

export type LookAudience = "women" | "men" | "kids";

export type LiveEffectFlags = {
  lip: string | null;
  kajal: boolean;
  lashes: boolean;
  blush: boolean;
  brow: boolean;
  hair: string | null;
};

/** Men’s live styling is hair and beard. Makeup stays off unless a bridal look asks for it. */
export function liveEffectsFor<T extends LiveEffectFlags>(audience: LookAudience | undefined, effects: T): T {
  if (audience !== "men") return effects;
  return { ...effects, lip: null, kajal: false, lashes: false, blush: false, brow: false };
}
