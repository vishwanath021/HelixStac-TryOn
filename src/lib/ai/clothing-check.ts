import sharp from "sharp";
import { primaryFace, type FaceBox } from "@/lib/face/region";
import { registerProviderFrame } from "@/lib/face/register";

const MEAN_DELTA = 22;

export type NecklineRect = { x0: number; y0: number; x1: number; y1: number };

export type ClothingFinding = {
  warning: "clothing_changed" | null;
  meanDelta: number;
  centerMean: number;
  registered: boolean;
  /** Always false. A quiet neckline is not an accepted haircut. */
  accepted: false;
  detail: string;
};

/** Shoulder and collar band just below the chin. Hair above this band is ignored. */
export function necklineRect(face: { x: number; y: number; w: number; h: number }, width: number, height: number): NecklineRect {
  const y0 = Math.min(height - 1, Math.max(0, Math.round(face.y + face.h * 0.98)));
  const y1 = Math.min(height, Math.max(y0 + 1, y0 + Math.max(6, Math.round(face.h * 0.4))));
  const x0 = Math.min(width - 1, Math.max(0, Math.round(face.x - face.w * 0.2)));
  const x1 = Math.min(width, Math.max(x0 + 1, Math.round(face.x + face.w * 1.2)));
  return { x0, y0, x1, y1 };
}

export function clothingBandDelta(
  original: Buffer,
  edited: Buffer,
  width: number,
  height: number,
  face: { x: number; y: number; w: number; h: number },
) {
  const band = necklineRect(face, width, height);
  const center0 = band.x0 + Math.floor((band.x1 - band.x0) * 0.3);
  const center1 = band.x0 + Math.ceil((band.x1 - band.x0) * 0.7);
  let sum = 0;
  let centerSum = 0;
  let samples = 0;
  let centerSamples = 0;
  let hot = 0;
  for (let y = band.y0; y < band.y1; y += 1) {
    for (let x = band.x0; x < band.x1; x += 1) {
      const i = (y * width + x) * 3;
      const delta = (Math.abs(original[i] - edited[i]) + Math.abs(original[i + 1] - edited[i + 1]) + Math.abs(original[i + 2] - edited[i + 2])) / 3;
      sum += delta;
      samples += 1;
      if (delta >= 30) hot += 1;
      if (x >= center0 && x < center1) {
        centerSum += delta;
        centerSamples += 1;
      }
    }
  }
  const mean = samples ? sum / samples : 0;
  const centerMean = centerSamples ? centerSum / centerSamples : 0;
  const changedFraction = samples ? hot / samples : 0;
  const warning = mean >= MEAN_DELTA || centerMean >= MEAN_DELTA || changedFraction >= 0.12 ? "clothing_changed" as const : null;
  return { warning, mean, centerMean, changedFraction, samples, band };
}

/**
 * Align the provider frame to the sanitized selfie, then compare the neckline band.
 * A large change is a warning. It does not accept or reject the haircut.
 */
export async function assessClothing(originalImage: Buffer, editedImage: Buffer): Promise<ClothingFinding> {
  const decoded = await sharp(originalImage, { failOn: "none" }).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = decoded.info.width;
  const height = decoded.info.height;
  const edited = await sharp(editedImage, { failOn: "none" })
    .rotate()
    .removeAlpha()
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer();
  const face = primaryFace(decoded.data, width, height);
  if (!face) {
    return {
      warning: null,
      meanDelta: 0,
      centerMean: 0,
      registered: false,
      accepted: false,
      detail: "clothing check skipped: no face to register. The run is not accepted.",
    };
  }
  const aligned = await registerProviderFrame(decoded.data, edited, width, height, face as FaceBox);
  const delta = clothingBandDelta(decoded.data, aligned.rgb, width, height, face);
  const meanDelta = Math.round(delta.mean * 10) / 10;
  const centerMean = Math.round(delta.centerMean * 10) / 10;
  return {
    warning: delta.warning,
    meanDelta,
    centerMean,
    registered: true,
    accepted: false,
    detail: delta.warning
      ? `clothing_changed mean ${meanDelta.toFixed(1)} center ${centerMean.toFixed(1)} after registration (${aligned.registration.detail}). Warning only. The run is not accepted.`
      : `neckline band mean ${meanDelta.toFixed(1)} after registration (${aligned.registration.detail}). No clothing warning. The run is still unvalidated.`,
  };
}
