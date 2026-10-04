import {
  CHIN,
  EAR_LEFT,
  EAR_RIGHT,
  FACE_OVAL,
  JAW,
  LANDMARK_COUNT,
  LEFT_BROW,
  LEFT_EYE,
  LEFT_IRIS,
  LIPS,
  LOWER_LIP,
  MOUTH_LEFT,
  MOUTH_RIGHT,
  NOSE_BLOB,
  NOSE_BOTTOM,
  RIGHT_BROW,
  RIGHT_EYE,
  RIGHT_IRIS,
  UPPER_LIP,
} from "@/lib/face/landmarks";
import { dilateMask, distanceFromOff, fillPolygon, sampleBilinear, stampDisks, type RgbImage } from "@/lib/face/raster";
import { applySimilarity, fitSimilarity, invertSimilarity, type Point, type Similarity } from "@/lib/face/similarity";

export class UnreliableDetectionError extends Error {
  readonly code = "UNRELIABLE_DETECTION";
}

export const DRIFT_LIMITS = {
  brow: 0.05,
  nose: 0.06,
  width: 0.08,
  ssim: 0.8,
} as const;

const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

export function meanPoint(points: Point[], indexes: readonly number[]): Point {
  let x = 0;
  let y = 0;
  for (const index of indexes) {
    x += points[index].x;
    y += points[index].y;
  }
  return { x: x / indexes.length, y: y / indexes.length };
}

export function requireLandmarks(points: Point[]) {
  if (points.length < LANDMARK_COUNT) {
    throw new UnreliableDetectionError("Face landmarks were incomplete. Hair-only composite did not run.");
  }
}

export function alignmentAnchors(points: Point[]): Point[] {
  requireLandmarks(points);
  const mouth = meanPoint(points, [UPPER_LIP, LOWER_LIP, MOUTH_LEFT, MOUTH_RIGHT]);
  return [meanPoint(points, LEFT_EYE), meanPoint(points, RIGHT_EYE), points[1], mouth];
}

/** Maps generated-image pixels onto the original. */
export function alignGeneratedToOriginal(generated: Point[], original: Point[]): Similarity {
  return fitSimilarity(alignmentAnchors(generated), alignmentAnchors(original));
}

export function faceRatios(points: Point[]) {
  requireLandmarks(points);
  const leftEye = meanPoint(points, LEFT_EYE);
  const rightEye = meanPoint(points, RIGHT_EYE);
  const eyeDist = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
  if (eyeDist < 1) throw new UnreliableDetectionError("The eye landmarks are too close. Hair-only composite did not run.");
  const leftBrow = meanPoint(points, LEFT_BROW);
  const rightBrow = meanPoint(points, RIGHT_BROW);
  const brow = (Math.hypot(leftBrow.x - leftEye.x, leftBrow.y - leftEye.y) + Math.hypot(rightBrow.x - rightEye.x, rightBrow.y - rightEye.y)) / 2 / eyeDist;
  const eyeMid = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
  const nose = Math.hypot(points[1].x - eyeMid.x, points[1].y - eyeMid.y) / eyeDist;
  const width = Math.hypot(points[EAR_LEFT].x - points[EAR_RIGHT].x, points[EAR_LEFT].y - points[EAR_RIGHT].y) / eyeDist;
  return { brow, nose, width, eyeDist };
}

export type DriftReport = {
  ssim: number;
  browDelta: number;
  noseDelta: number;
  widthDelta: number;
  flagged: boolean;
  ratios: { brow: number; nose: number; width: number };
};

export function luminance(image: RgbImage, index: number) {
  const i = index * 3;
  return 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
}

/** Global SSIM on the protected-zone luminance. C1 and C2 use the standard 0.01 and 0.03 constants. */
export function ssimRegion(original: RgbImage, compared: RgbImage, zone: Uint8Array) {
  if (original.width !== compared.width || original.height !== compared.height || zone.length !== original.width * original.height) {
    throw new Error("Drift images must share the original frame.");
  }
  let n = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < zone.length; i += 1) {
    if (zone[i] < 128) continue;
    sumA += luminance(original, i);
    sumB += luminance(compared, i);
    n += 1;
  }
  if (n < 16) return 0;
  const muA = sumA / n;
  const muB = sumB / n;
  let varA = 0;
  let varB = 0;
  let cov = 0;
  for (let i = 0; i < zone.length; i += 1) {
    if (zone[i] < 128) continue;
    const a = luminance(original, i) - muA;
    const b = luminance(compared, i) - muB;
    varA += a * a;
    varB += b * b;
    cov += a * b;
  }
  varA /= n;
  varB /= n;
  cov /= n;
  const num = (2 * muA * muB + C1) * (2 * cov + C2);
  const den = (muA * muA + muB * muB + C1) * (varA + varB + C2);
  return den === 0 ? 1 : num / den;
}

export function faceDrift(args: {
  original: RgbImage;
  compared: RgbImage;
  originalLandmarks: Point[];
  comparedLandmarks: Point[];
  zone: Uint8Array;
}): DriftReport {
  const left = faceRatios(args.originalLandmarks);
  const right = faceRatios(args.comparedLandmarks);
  const browDelta = Math.abs(left.brow - right.brow);
  const noseDelta = Math.abs(left.nose - right.nose);
  const widthDelta = Math.abs(left.width - right.width);
  const ssim = ssimRegion(args.original, args.compared, args.zone);
  const flagged = browDelta > DRIFT_LIMITS.brow || noseDelta > DRIFT_LIMITS.nose || widthDelta > DRIFT_LIMITS.width || ssim < DRIFT_LIMITS.ssim;
  return { ssim, browDelta, noseDelta, widthDelta, flagged, ratios: { brow: right.brow, nose: right.nose, width: right.width } };
}

export function buildProtectedZone(args: { width: number; height: number; landmarks: Point[]; oldHair: Uint8Array }) {
  const { width, height, landmarks, oldHair } = args;
  requireLandmarks(landmarks);
  if (oldHair.length !== width * height) throw new Error("The hair mask does not match the frame.");
  const ratios = faceRatios(landmarks);
  const eye = ratios.eyeDist;
  const zone = new Uint8Array(width * height);
  fillPolygon(zone, width, height, FACE_OVAL.map((index) => landmarks[index]));
  for (let i = 0; i < zone.length; i += 1) {
    if (oldHair[i] >= 128) zone[i] = 0;
  }
  const features = new Uint8Array(width * height);
  stampDisks(features, width, height, [...LEFT_EYE, ...RIGHT_EYE, ...LEFT_IRIS, ...RIGHT_IRIS].map((index) => landmarks[index]), eye * 0.2);
  stampDisks(features, width, height, [...LEFT_BROW, ...RIGHT_BROW].map((index) => landmarks[index]), eye * 0.12);
  stampDisks(features, width, height, NOSE_BLOB.map((index) => landmarks[index]), eye * 0.14);
  const lipPoints = LIPS.map((index) => landmarks[index]);
  fillPolygon(features, width, height, lipPoints);
  const lipDisk = dilateMask(features, width, height, Math.max(2, eye * 0.06));
  features.set(lipDisk);

  const mouth = meanPoint(landmarks, [MOUTH_LEFT, MOUTH_RIGHT, UPPER_LIP]);
  const lower = landmarks[LOWER_LIP];
  const drop = Math.max(eye * 0.45, (landmarks[CHIN].y - lower.y) * 0.85);
  const beard = JAW.map((index) => {
    const point = landmarks[index];
    const vx = point.x - mouth.x;
    const vy = point.y - mouth.y;
    const len = Math.hypot(vx, vy) || 1;
    const extra = eye * 0.22;
    return {
      x: point.x + (vx / len) * extra,
      y: point.y + (vy / len) * extra + (point.y >= lower.y ? drop : drop * 0.25),
    };
  });
  fillPolygon(features, width, height, [landmarks[MOUTH_RIGHT], ...beard, landmarks[MOUTH_LEFT]]);
  fillPolygon(features, width, height, [
    landmarks[NOSE_BOTTOM],
    landmarks[98],
    landmarks[MOUTH_LEFT],
    landmarks[UPPER_LIP],
    landmarks[MOUTH_RIGHT],
    landmarks[327],
  ]);

  const ears = new Uint8Array(width * height);
  stampDisks(ears, width, height, [landmarks[EAR_LEFT], landmarks[EAR_RIGHT]], eye * 0.32);
  for (let i = 0; i < zone.length; i += 1) {
    if (features[i] >= 128) zone[i] = 255;
    else if (ears[i] >= 128 && oldHair[i] < 128) zone[i] = 255;
  }
  return zone;
}

export function buildEditMask(args: {
  oldHair: Uint8Array;
  newHair: Uint8Array;
  garments: Uint8Array;
  skin: Uint8Array;
  protectedZone: Uint8Array;
  width: number;
  height: number;
  dilatePx: number;
}) {
  const dilated = dilateMask(args.oldHair, args.width, args.height, args.dilatePx);
  const edit = new Uint8Array(args.oldHair.length);
  for (let i = 0; i < edit.length; i += 1) {
    if (args.protectedZone[i] >= 128) continue;
    if (args.garments[i] >= 128 && args.oldHair[i] < 128) continue;
    if (args.skin[i] >= 128 && dilated[i] < 128) continue;
    if (dilated[i] >= 128 || args.newHair[i] >= 128) edit[i] = 255;
  }
  return edit;
}

export function warpRgb(src: RgbImage, generatedToOriginal: Similarity, width: number, height: number): RgbImage {
  const inverse = invertSimilarity(generatedToOriginal);
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = applySimilarity(inverse, { x: x + 0.5, y: y + 0.5 });
      const [r, g, b] = sampleBilinear(src, source.x - 0.5, source.y - 0.5);
      const o = (y * width + x) * 3;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
    }
  }
  return { data, width, height };
}

export function warpMask(mask: Uint8Array, srcWidth: number, srcHeight: number, generatedToOriginal: Similarity, width: number, height: number) {
  const inverse = invertSimilarity(generatedToOriginal);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = applySimilarity(inverse, { x: x + 0.5, y: y + 0.5 });
      const sx = Math.max(0, Math.min(srcWidth - 1, Math.round(source.x - 0.5)));
      const sy = Math.max(0, Math.min(srcHeight - 1, Math.round(source.y - 0.5)));
      out[y * width + x] = mask[sy * srcWidth + sx];
    }
  }
  return out;
}

function clampGain(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(0.75, Math.min(1.35, value));
}

export function compositeHair(args: {
  original: RgbImage;
  aligned: RgbImage;
  oldHair: Uint8Array;
  newHair: Uint8Array;
  garments: Uint8Array;
  skin: Uint8Array;
  protectedZone: Uint8Array;
  featherPx?: number;
  dilatePx?: number;
}) {
  const { original, aligned } = args;
  const width = original.width;
  const height = original.height;
  if (aligned.width !== width || aligned.height !== height) throw new Error("The aligned frame must match the original.");
  const feather = args.featherPx ?? Math.max(4, Math.round(0.012 * Math.min(width, height)));
  const dilatePx = args.dilatePx ?? Math.max(4, Math.round(0.015 * Math.min(width, height)));
  const edit = buildEditMask({ ...args, width, height, dilatePx });
  const inside = distanceFromOff(edit, width, height);
  const ringRadius = Math.max(feather, 6);
  const ring = dilateMask(edit, width, height, ringRadius);
  const originalSum = [0, 0, 0];
  const alignedSum = [0, 0, 0];
  let ringCount = 0;
  for (let i = 0; i < edit.length; i += 1) {
    if (ring[i] < 128 || edit[i] >= 128) continue;
    const o = i * 3;
    originalSum[0] += original.data[o];
    originalSum[1] += original.data[o + 1];
    originalSum[2] += original.data[o + 2];
    alignedSum[0] += aligned.data[o];
    alignedSum[1] += aligned.data[o + 1];
    alignedSum[2] += aligned.data[o + 2];
    ringCount += 1;
  }
  const gains = [0, 1, 2].map((channel) => (ringCount > 20 && alignedSum[channel] > 0 ? clampGain(originalSum[channel] / alignedSum[channel]) : 1));
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < edit.length; i += 1) {
    const alpha = edit[i] < 128 ? 0 : feather <= 0 ? 1 : Math.min(1, inside[i] / feather);
    const o = i * 3;
    const hairPixel = args.newHair[i] >= 128;
    for (let channel = 0; channel < 3; channel += 1) {
      const generated = hairPixel ? Math.max(0, Math.min(255, Math.round(aligned.data[o + channel] * gains[channel]))) : aligned.data[o + channel];
      data[o + channel] = Math.round(original.data[o + channel] * (1 - alpha) + generated * alpha);
    }
  }
  return { image: { data, width, height }, edit, gains, featherPx: feather };
}

export function maskOverlay(original: RgbImage, oldHair: Uint8Array, newHair: Uint8Array, protectedZone: Uint8Array): RgbImage {
  const data = Buffer.from(original.data);
  for (let i = 0; i < oldHair.length; i += 1) {
    const o = i * 3;
    if (oldHair[i] >= 128) {
      data[o] = Math.round(data[o] * 0.55);
      data[o + 1] = Math.round(data[o + 1] * 0.55 + 40);
      data[o + 2] = Math.min(255, Math.round(data[o + 2] * 0.45 + 140));
    }
    if (newHair[i] >= 128) {
      data[o] = Math.min(255, Math.round(data[o] * 0.45 + 150));
      data[o + 1] = Math.round(data[o + 1] * 0.55);
      data[o + 2] = Math.min(255, Math.round(data[o + 2] * 0.45 + 90));
    }
    if (protectedZone[i] >= 128) {
      data[o] = Math.min(255, Math.round(data[o] * 0.65 + 90));
      data[o + 1] = Math.min(255, Math.round(data[o + 1] * 0.65 + 70));
      data[o + 2] = Math.round(data[o + 2] * 0.55);
    }
  }
  return { data, width: original.width, height: original.height };
}
