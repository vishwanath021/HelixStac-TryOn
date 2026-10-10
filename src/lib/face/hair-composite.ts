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
import { dilateMask, distanceFromOff, distanceToOn, erodeMask, fillPolygon, nearestOnIndex, sampleBilinear, stampDisks, type RgbImage } from "@/lib/face/raster";
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

/**
 * Mean landmark distance after a similarity fit, divided by eye distance.
 * SSIM, ear width, and the ratio deltas stay on the report for review.
 * They do not set `flagged`.
 */
export const FACE_LANDMARK_LIMIT = 0.08;

const FACE_CHECK_INDEXES = [...new Set<number>([...LEFT_EYE, ...RIGHT_EYE, ...LEFT_BROW, ...RIGHT_BROW, ...NOSE_BLOB, ...LIPS])];

/** Feather stays a few pixels. A wide blend was pulling the generated pale edge onto the wall. */
export const HAIR_FEATHER_PX = 3;
export const HAIR_ERODE_PX = 2;
export const HALO_BAND_PX = 4;
/** Mean per-channel difference vs the original wall, in the band outside the true hair. */
export const HALO_MAX_DELTA = 14;

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
  /** Mean eyes/brows/nose/mouth error after similarity alignment, in eye-distance units. */
  landmarkError: number;
  flagged: boolean;
  ratios: { brow: number; nose: number; width: number };
};

/** Eyes, brows, nose, and lips. Ears are left out because hair covers them. */
export function faceCheckIndexes() {
  return FACE_CHECK_INDEXES;
}

/**
 * Fit a similarity from the compared anchors onto the original, then measure
 * eyes, brows, nose, and mouth. A new haircut, a sofa, or a scale shift that
 * the similarity explains does not increase this number.
 */
export function landmarkError(originalLandmarks: Point[], comparedLandmarks: Point[]) {
  requireLandmarks(originalLandmarks);
  requireLandmarks(comparedLandmarks);
  const sim = fitSimilarity(alignmentAnchors(comparedLandmarks), alignmentAnchors(originalLandmarks));
  const eye = faceRatios(originalLandmarks).eyeDist;
  let sum = 0;
  for (const index of FACE_CHECK_INDEXES) {
    const mapped = applySimilarity(sim, comparedLandmarks[index]);
    const point = originalLandmarks[index];
    sum += Math.hypot(mapped.x - point.x, mapped.y - point.y);
  }
  return sum / FACE_CHECK_INDEXES.length / eye;
}

/** Green disks are the selfie. A red centre is the generated landmark after alignment. */
export function drawFaceCheck(base: RgbImage, originalLandmarks: Point[], comparedLandmarks: Point[]): RgbImage {
  const sim = fitSimilarity(alignmentAnchors(comparedLandmarks), alignmentAnchors(originalLandmarks));
  const data = Buffer.from(base.data);
  const paint = (point: Point, rgb: [number, number, number], radius: number) => {
    const x0 = Math.round(point.x);
    const y0 = Math.round(point.y);
    for (let y = y0 - radius; y <= y0 + radius; y += 1) {
      for (let x = x0 - radius; x <= x0 + radius; x += 1) {
        if (x < 0 || y < 0 || x >= base.width || y >= base.height) continue;
        const i = (y * base.width + x) * 3;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
      }
    }
  };
  for (const index of FACE_CHECK_INDEXES) {
    paint(originalLandmarks[index], [40, 220, 80], 2);
    paint(applySimilarity(sim, comparedLandmarks[index]), [230, 40, 40], 0);
  }
  return { data, width: base.width, height: base.height };
}

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
  const error = landmarkError(args.originalLandmarks, args.comparedLandmarks);
  const flagged = error > FACE_LANDMARK_LIMIT;
  return {
    ssim,
    browDelta,
    noseDelta,
    widthDelta,
    landmarkError: error,
    flagged,
    ratios: { brow: right.brow, nose: right.nose, width: right.width },
  };
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
  const feather = args.featherPx ?? HAIR_FEATHER_PX;
  if (feather <= 0) return hardComposite(args, width, height);
  return refinedComposite(args, width, height, feather);
}

function hardComposite(args: {
  original: RgbImage;
  aligned: RgbImage;
  oldHair: Uint8Array;
  newHair: Uint8Array;
  garments: Uint8Array;
  skin: Uint8Array;
  protectedZone: Uint8Array;
  dilatePx?: number;
}, width: number, height: number) {
  const dilatePx = args.dilatePx ?? Math.max(4, Math.round(0.015 * Math.min(width, height)));
  const edit = buildEditMask({ ...args, width, height, dilatePx });
  const data = Buffer.from(args.original.data);
  for (let i = 0; i < edit.length; i += 1) {
    if (edit[i] < 128) continue;
    const o = i * 3;
    data[o] = args.aligned.data[o];
    data[o + 1] = args.aligned.data[o + 1];
    data[o + 2] = args.aligned.data[o + 2];
  }
  return { image: { data, width, height }, edit, gains: [1, 1, 1], featherPx: 0 };
}

type Rgb = [number, number, number];

function pixelAt(image: RgbImage, index: number): Rgb {
  const o = index * 3;
  return [image.data[o], image.data[o + 1], image.data[o + 2]];
}

function colourDistance(a: Rgb, b: Rgb) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function lumaOf(rgb: Rgb) {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

function meanRgb(original: RgbImage, accept: (index: number) => boolean, minCount: number): Rgb | null {
  const sum = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < original.width * original.height; i += 1) {
    if (!accept(i)) continue;
    const rgb = pixelAt(original, i);
    sum[0] += rgb[0];
    sum[1] += rgb[1];
    sum[2] += rgb[2];
    count += 1;
  }
  if (count < minCount) return null;
  return [sum[0] / count, sum[1] / count, sum[2] / count];
}

function estimateWall(original: RgbImage, blocked: Uint8Array, near: Uint8Array): Rgb {
  return meanRgb(original, (index) => blocked[index] < 128 && near[index] >= 128, 8)
    ?? meanRgb(original, (index) => blocked[index] < 128, 1)
    ?? [210, 205, 198];
}

/**
 * Wall pixels a few pixels outside the hair, keeping the brighter half so a
 * dark unmasked fringe does not pull the fill gray.
 */
function knownWallMask(original: RgbImage, blocked: Uint8Array, awayFromHair: Uint8Array) {
  const lumas: number[] = [];
  const provisional = new Uint8Array(blocked.length);
  for (let i = 0; i < blocked.length; i += 1) {
    if (blocked[i] >= 128 || awayFromHair[i] >= 128) continue;
    provisional[i] = 255;
    lumas.push(lumaOf(pixelAt(original, i)));
  }
  if (lumas.length < 30) return provisional;
  lumas.sort((a, b) => a - b);
  const median = lumas[lumas.length >> 1];
  const out = new Uint8Array(blocked.length);
  let count = 0;
  for (let i = 0; i < provisional.length; i += 1) {
    if (provisional[i] < 128) continue;
    if (lumaOf(pixelAt(original, i)) < median - 18) continue;
    out[i] = 255;
    count += 1;
  }
  return count >= 30 ? out : provisional;
}

/**
 * Trimap from the segmenter: eroded hair is definite foreground, the outside is
 * definite original, and a few pixels of rim are unknown. A guided filter snaps
 * that rim to the aligned luminance, then pale spill that matches the wall is dropped.
 */
function refineHairAlpha(aligned: RgbImage, newHair: Uint8Array, wall: Rgb, hairMean: Rgb, feather: number) {
  const width = aligned.width;
  const height = aligned.height;
  const eroded = erodeMask(newHair, width, height, HAIR_ERODE_PX);
  const guided = guidedAlpha(aligned, eroded, 2, 80);
  const alpha = new Float32Array(newHair.length);
  const inside = distanceFromOff(eroded, width, height);
  for (let i = 0; i < alpha.length; i += 1) {
    if (newHair[i] < 128 && eroded[i] < 128) continue;
    const gen = pixelAt(aligned, i);
    const paleSpill = lumaOf(gen) > lumaOf(hairMean) + 28 && colourDistance(gen, wall) + 8 < colourDistance(gen, hairMean);
    if (paleSpill) continue;
    const soft = eroded[i] >= 128 ? Math.min(1, inside[i] / feather) : Math.min(0.35, guided[i]);
    alpha[i] = soft;
  }
  return alpha;
}

function guidedAlpha(guideImage: RgbImage, mask: Uint8Array, radius: number, eps: number) {
  const width = guideImage.width;
  const height = guideImage.height;
  const n = width * height;
  const guide = new Float32Array(n);
  const input = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    guide[i] = lumaOf(pixelAt(guideImage, i)) / 255;
    input[i] = mask[i] >= 128 ? 1 : 0;
  }
  const meanI = boxMean(guide, width, height, radius);
  const meanP = boxMean(input, width, height, radius);
  const ip = new Float32Array(n);
  const ii = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    ip[i] = guide[i] * input[i];
    ii[i] = guide[i] * guide[i];
  }
  const meanIp = boxMean(ip, width, height, radius);
  const meanIi = boxMean(ii, width, height, radius);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const varI = meanIi[i] - meanI[i] * meanI[i];
    const cov = meanIp[i] - meanI[i] * meanP[i];
    a[i] = cov / (varI + eps / (255 * 255));
    b[i] = meanP[i] - a[i] * meanI[i];
  }
  const meanA = boxMean(a, width, height, radius);
  const meanB = boxMean(b, width, height, radius);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = Math.max(0, Math.min(1, meanA[i] * guide[i] + meanB[i]));
  return out;
}

function boxMean(src: Float32Array, width: number, height: number, radius: number) {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += src[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + row;
    }
  }
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = integral[(y1 + 1) * (width + 1) + (x1 + 1)] - integral[y0 * (width + 1) + (x1 + 1)] - integral[(y1 + 1) * (width + 1) + x0] + integral[y0 * (width + 1) + x0];
      out[y * width + x] = sum / area;
    }
  }
  return out;
}

function refinedComposite(args: {
  original: RgbImage;
  aligned: RgbImage;
  oldHair: Uint8Array;
  newHair: Uint8Array;
  garments: Uint8Array;
  skin: Uint8Array;
  protectedZone: Uint8Array;
}, width: number, height: number, feather: number) {
  const { original, aligned } = args;
  const hairUnion = new Uint8Array(args.oldHair.length);
  for (let i = 0; i < hairUnion.length; i += 1) if (args.oldHair[i] >= 128 || args.newHair[i] >= 128) hairUnion[i] = 255;
  const near = dilateMask(hairUnion, width, height, 12);
  const blocked = new Uint8Array(hairUnion.length);
  for (let i = 0; i < blocked.length; i += 1) {
    if (hairUnion[i] >= 128 || args.garments[i] >= 128 || args.skin[i] >= 128 || args.protectedZone[i] >= 128) blocked[i] = 255;
  }
  const wall = estimateWall(original, blocked, near);
  const away = dilateMask(hairUnion, width, height, 6);
  const wallSource = nearestOnIndex(knownWallMask(original, blocked, away), width, height);
  const localWall = (index: number): Rgb => {
    const src = wallSource[index];
    return src >= 0 ? pixelAt(original, src) : wall;
  };
  const core = erodeMask(args.newHair, width, height, HAIR_ERODE_PX);
  const hairSum = [0, 0, 0];
  let hairCount = 0;
  for (let i = 0; i < core.length; i += 1) {
    if (core[i] < 128) continue;
    const rgb = pixelAt(aligned, i);
    hairSum[0] += rgb[0];
    hairSum[1] += rgb[1];
    hairSum[2] += rgb[2];
    hairCount += 1;
  }
  const hairMean: Rgb = hairCount > 10 ? [hairSum[0] / hairCount, hairSum[1] / hairCount, hairSum[2] / hairCount] : [30, 20, 15];
  const alpha = refineHairAlpha(aligned, args.newHair, wall, hairMean, feather);
  const oldNear = dilateMask(args.oldHair, width, height, 2);
  const edit = new Uint8Array(alpha.length);
  const data = Buffer.from(original.data);
  for (let i = 0; i < alpha.length; i += 1) {
    if (args.protectedZone[i] >= 128) continue;
    if (args.garments[i] >= 128 && args.oldHair[i] < 128) continue;
    if (args.skin[i] >= 128 && args.oldHair[i] < 128 && args.newHair[i] < 128) continue;
    const o = i * 3;
    const cover = alpha[i];
    if (cover > 0.04 && core[i] < 128 && args.oldHair[i] < 128) continue;
    if (cover > 0.04) {
      edit[i] = 255;
      const generated = pixelAt(aligned, i);
      const base = pixelAt(original, i);
      const background = args.oldHair[i] >= 128 ? localWall(i) : base;
      for (let channel = 0; channel < 3; channel += 1) {
        const unmixed = cover >= 0.98
          ? generated[channel]
          : Math.max(0, Math.min(255, (generated[channel] - (1 - cover) * background[channel]) / cover));
        data[o + channel] = Math.round(unmixed * cover + base[channel] * (1 - cover));
      }
      continue;
    }
    const originalPixel = pixelAt(original, i);
    const fringe = args.oldHair[i] < 128 && oldNear[i] >= 128 && args.newHair[i] < 128 && lumaOf(originalPixel) + 20 < lumaOf(localWall(i));
    if ((args.oldHair[i] >= 128 && args.newHair[i] < 128) || fringe) {
      const generated = pixelAt(aligned, i);
      const local = localWall(i);
      const palerThanWall = lumaOf(generated) > lumaOf(local) + 8;
      const matched = !palerThanWall && colourDistance(generated, local) <= 30;
      edit[i] = 255;
      for (let channel = 0; channel < 3; channel += 1) {
        const filled = matched ? local[channel] + (generated[channel] - local[channel]) * 0.25 : local[channel];
        data[o + channel] = Math.max(0, Math.min(255, Math.round(filled)));
      }
    }
  }
  return { image: { data, width, height }, edit, gains: [1, 1, 1], featherPx: feather };
}

/** Mean per-channel change on wall pixels beside the new hair. Old hair is excluded so a removed length is not counted as a halo. */
export function unchangedWallDelta(original: RgbImage, result: RgbImage, oldHair: Uint8Array, newHair: Uint8Array, bandPx = HALO_BAND_PX) {
  const dist = distanceToOn(newHair, original.width, original.height);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < newHair.length; i += 1) {
    if (newHair[i] >= 128 || oldHair[i] >= 128 || dist[i] < 1 || dist[i] > bandPx) continue;
    const left = pixelAt(original, i);
    const right = pixelAt(result, i);
    sum += colourDistance(left, right);
    count += 1;
  }
  return count ? sum / count / 3 : 0;
}

/** Mean per-channel difference between the composite and the original, in the band outside `hair`. */
export function backgroundEdgeDelta(original: RgbImage, result: RgbImage, hair: Uint8Array, bandPx = HALO_BAND_PX) {
  const dist = distanceToOn(hair, original.width, original.height);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < hair.length; i += 1) {
    if (hair[i] >= 128 || dist[i] < 1 || dist[i] > bandPx) continue;
    const left = pixelAt(original, i);
    const right = pixelAt(result, i);
    sum += colourDistance(left, right);
    count += 1;
  }
  return count ? sum / count / 3 : 0;
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
