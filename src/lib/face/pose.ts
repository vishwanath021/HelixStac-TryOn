import { FACE_OVAL, JAW, LEFT_BROW, RIGHT_BROW } from "@/lib/face/landmarks";

/** Normalized MediaPipe face landmark. x and y are 0–1 of the photo. z is optional depth. */
export type FaceLandmark = { x: number; y: number; z?: number };

export const YAW_LIMIT = 25;
export const ROLL_LIMIT = 20;
export const PITCH_LIMIT = 25;
/** Beard allows a mild turn. Past this, the far side of the jaw is out of view. */
export const JAW_YAW_LIMIT = 35;

/** Nose position between the eyes and the chin on a level, front-facing face. */
const NEUTRAL_NOSE = 0.36;
const PITCH_SCALE = 110;

export type HeadPose = {
  yaw: number;
  roll: number;
  pitch: number;
  /** Inter-eye distance in pixels. */
  eyePx: number;
  /** Face height in pixels. */
  faceSize: number;
};

export type PlacementDebug = {
  yaw: number | null;
  roll: number | null;
  pitch: number | null;
  faceSize: number | null;
  maskArea: number;
  failed: string | null;
  source: "landmarks" | "fallback";
  warning: string;
};

export const POSE_FALLBACK_WARNING = "We could not measure the head angle, so this preview is less certain.";

export type PixelPoint = { x: number; y: number };

const EYE_RIGHT = 33;
const EYE_LEFT = 263;
const NOSE = 1;
const CHIN = 152;
const CHEEK_RIGHT = 234;
const CHEEK_LEFT = 454;
const MOUTH_RIGHT = 61;
const MOUTH_LEFT = 291;
const UPPER_LIP = 13;

function finitePoint(points: FaceLandmark[], index: number) {
  const point = points[index];
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return point;
}

export function parseLandmarks(raw: unknown): FaceLandmark[] | null {
  if (typeof raw !== "string" || raw.length < 20 || raw.length > 120_000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 478) return null;
  const out: FaceLandmark[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;
    const row = item as { x?: unknown; y?: unknown; z?: unknown };
    const x = Number(row.x);
    const y = Number(row.y);
    const z = row.z === undefined ? 0 : Number(row.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    if (x < -0.3 || x > 1.3 || y < -0.3 || y > 1.3 || Math.abs(z) > 5) return null;
    out.push({ x, y, z });
  }
  return out;
}

function pixel(point: FaceLandmark, width: number, height: number): PixelPoint & { z: number } {
  return { x: point.x * width, y: point.y * height, z: point.z ?? 0 };
}

/** Yaw, roll, and pitch in degrees. Positive roll lowers the person's left eye. */
export function poseFromLandmarks(points: FaceLandmark[], width: number, height: number): HeadPose | null {
  if (!points || points.length < 478 || width < 2 || height < 2) return null;
  const eyeRight = finitePoint(points, EYE_RIGHT);
  const eyeLeft = finitePoint(points, EYE_LEFT);
  const nose = finitePoint(points, NOSE);
  const chin = finitePoint(points, CHIN);
  const cheekRight = finitePoint(points, CHEEK_RIGHT);
  const cheekLeft = finitePoint(points, CHEEK_LEFT);
  if (!eyeRight || !eyeLeft || !nose || !chin || !cheekRight || !cheekLeft) return null;
  const right = pixel(eyeRight, width, height);
  const left = pixel(eyeLeft, width, height);
  const nosePx = pixel(nose, width, height);
  const chinPx = pixel(chin, width, height);
  const eyePx = Math.hypot(left.x - right.x, left.y - right.y);
  if (eyePx < 1) return null;
  const roll = (Math.atan2(left.y - right.y, left.x - right.x) * 180) / Math.PI;
  const midX = (right.x + left.x) / 2;
  const midY = (right.y + left.y) / 2;
  const ux = (left.x - right.x) / eyePx;
  const uy = (left.y - right.y) / eyePx;
  const along = (nosePx.x - midX) * ux + (nosePx.y - midY) * uy;
  const yaw2d = (Math.atan2(along, eyePx) * 180) / Math.PI;
  const dx = cheekLeft.x - cheekRight.x;
  const dz = (cheekLeft.z ?? 0) - (cheekRight.z ?? 0);
  const yawDepth = Math.abs(dx) > 1e-4 ? (Math.atan2(dz, dx) * 180) / Math.PI : 0;
  const yaw = Math.abs(dz) > 0.03 && Math.abs(yawDepth) > Math.abs(yaw2d) ? yawDepth : yaw2d;
  const ax = chinPx.x - midX;
  const ay = chinPx.y - midY;
  const span = Math.hypot(ax, ay);
  const noseRatio = span > 1 ? ((nosePx.x - midX) * ax + (nosePx.y - midY) * ay) / (span * span) : NEUTRAL_NOSE;
  const pitch = (noseRatio - NEUTRAL_NOSE) * PITCH_SCALE;
  const face = faceBoxFromLandmarks(points, width, height);
  return { yaw, roll, pitch, eyePx, faceSize: face?.h ?? Math.abs(span) * 1.6 };
}

export function faceBoxFromLandmarks(points: FaceLandmark[], width: number, height: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let used = 0;
  for (const index of FACE_OVAL) {
    const point = finitePoint(points, index);
    if (!point) continue;
    const x = point.x * width;
    const y = point.y * height;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    used += 1;
  }
  if (used < 4) return null;
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 2 || h < 2) return null;
  return { x: minX, y: minY, w, h, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** The jaw line is in frame and wide enough to be a front view. A clear profile fails this. */
export function jawVisible(points: FaceLandmark[], width: number, height: number, yaw: number) {
  if (Math.abs(yaw) > JAW_YAW_LIMIT) return false;
  const needed = [CHIN, 172, 397, 136, 365, MOUTH_RIGHT, MOUTH_LEFT];
  for (const index of needed) {
    const point = finitePoint(points, index);
    if (!point) return false;
    if (point.x < -0.02 || point.x > 1.02 || point.y < -0.02 || point.y > 1.02) return false;
  }
  const chin = points[CHIN];
  if (chin.y > 0.98) return false;
  const eyeRight = points[EYE_RIGHT];
  const eyeLeft = points[EYE_LEFT];
  const eye = Math.hypot((eyeLeft.x - eyeRight.x) * width, (eyeLeft.y - eyeRight.y) * height);
  const jaw = Math.hypot((points[397].x - points[172].x) * width, (points[397].y - points[172].y) * height);
  return eye > 1 && jaw >= eye * 1.05;
}

export function browStroke(points: FaceLandmark[], width: number, height: number): PixelPoint[] {
  return [...RIGHT_BROW, ...LEFT_BROW].flatMap((index) => {
    const point = finitePoint(points, index);
    return point ? [pixel(point, width, height)] : [];
  });
}

/** Jawline closed along the upper lip. The mouth itself is punched out by the caller. */
export function beardLoop(points: FaceLandmark[], width: number, height: number): PixelPoint[] {
  const loop = [...JAW, MOUTH_RIGHT, UPPER_LIP, MOUTH_LEFT];
  const out: PixelPoint[] = [];
  for (const index of loop) {
    const point = finitePoint(points, index);
    if (!point) return [];
    out.push(pixel(point, width, height));
  }
  return out;
}

/** Forehead band just above the brows. Eyebrow hairs themselves are not in this box. */
export function fringeBox(points: FaceLandmark[], width: number, height: number) {
  const stroke = browStroke(points, width, height);
  if (stroke.length < 4) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  for (const point of stroke) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
  }
  const eyeRight = finitePoint(points, EYE_RIGHT);
  const eyeLeft = finitePoint(points, EYE_LEFT);
  const eye = eyeRight && eyeLeft ? Math.hypot((eyeLeft.x - eyeRight.x) * width, (eyeLeft.y - eyeRight.y) * height) : (maxX - minX) * 0.45;
  const pad = Math.max(4, eye * 0.12);
  return {
    x0: Math.max(0, Math.floor(minX - pad)),
    x1: Math.min(width - 1, Math.ceil(maxX + pad)),
    y0: Math.max(0, Math.floor(minY - eye * 0.2)),
    y1: Math.max(0, Math.floor(minY - eye * 0.02)),
  };
}

export function debugFromPose(pose: HeadPose | null, extra: Partial<PlacementDebug> & Pick<PlacementDebug, "source">): PlacementDebug {
  return {
    yaw: pose ? round1(pose.yaw) : null,
    roll: pose ? round1(pose.roll) : null,
    pitch: pose ? round1(pose.pitch) : null,
    faceSize: pose ? Math.round(pose.faceSize) : null,
    maskArea: extra.maskArea ?? 0,
    failed: extra.failed ?? null,
    source: extra.source,
    warning: extra.warning ?? "",
  };
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

/** Brows reject an out-of-range head angle. Beard does not use these limits. */
export function poseOutOfRange(pose: HeadPose): "yaw" | "roll" | "pitch" | null {
  if (Math.abs(pose.yaw) > YAW_LIMIT) return "yaw";
  if (Math.abs(pose.roll) > ROLL_LIMIT) return "roll";
  if (Math.abs(pose.pitch) > PITCH_LIMIT) return "pitch";
  return null;
}
