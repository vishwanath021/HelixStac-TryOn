import sharp from "sharp";
import { classifySkinPhoto } from "@/lib/hand-photo";

export const TRY_ANOTHER_PHOTO = "Try another photo. We couldn't place this look safely on this picture.";
export const BROWS_HIDDEN = "Brows hidden by hair. Move your fringe aside and try again.";
export const FACE_TOO_TILTED = "Face too tilted. Hold the phone level and try again.";
export const FACE_TOO_TURNED = "Face too turned. Look straight at the camera and try again.";

/** A slight head roll still reads as a front-facing selfie. The 28° fixture stays over this. */
export const BROW_ROLL_LIMIT = 24;
/** Profile faces in the fixtures sit near 0.79. Partial bangs stay above this. */
export const BROW_SYMMETRY_MIN = 0.86;
/** Fringe across part of the brow band is allowed. A band that is mostly hair is not. */
export const BROW_HAIR_MAX = 0.62;

export type RegionTool = "style" | "colour" | "brows" | "beard" | "nails";

export type FaceBox = { x: number; y: number; w: number; h: number; cx: number; cy: number };

export type BrowSignals = {
  /** Degrees from upright. 0 is level. */
  rollDeg: number;
  /** 1 is a symmetric front view. */
  symmetry: number;
  faceHeight: number;
  /** Share of the brow band that is hair-coloured. */
  browHair: number;
  /** Brow mask area divided by the frame. */
  maskFraction: number;
  /** The mask center sits in the brow zone. */
  inBrowZone: boolean;
};

export type BrowPoint = { x: number; y: number };

/** Brow, eye, nose, and chin points from a fixture. Tests build these without a photo. */
export type BrowLandmarks = {
  leftBrow: BrowPoint;
  rightBrow: BrowPoint;
  leftEye: BrowPoint;
  rightEye: BrowPoint;
  nose: BrowPoint;
  chin: BrowPoint;
  /** 0–1 hair coverage of the brow zone. */
  hairCover: number;
};

function pointDistance(a: BrowPoint, b: BrowPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Turn landmark positions into the same signals the photo check uses. */
export function browSignalsFromLandmarks(marks: BrowLandmarks, frame = { width: 768, height: 1024 }): BrowSignals {
  const dx = marks.rightBrow.x - marks.leftBrow.x;
  const dy = marks.rightBrow.y - marks.leftBrow.y;
  const rollDeg = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  const left = pointDistance(marks.leftBrow, marks.nose);
  const right = pointDistance(marks.rightBrow, marks.nose);
  const symmetry = 1 - Math.abs(left - right) / Math.max(left, right, 1);
  const faceTop = Math.min(marks.leftBrow.y, marks.rightBrow.y, marks.leftEye.y, marks.rightEye.y);
  const faceHeight = Math.max(0, marks.chin.y - faceTop);
  const browW = Math.max(1, Math.hypot(dx, dy));
  const browH = Math.max(8, faceHeight * 0.11);
  const maskFraction = (browW * browH) / Math.max(1, frame.width * frame.height);
  const cy = (marks.leftBrow.y + marks.rightBrow.y) / 2;
  const zoneTop = faceTop - faceHeight * 0.05;
  const inBrowZone = cy >= zoneTop && cy <= zoneTop + faceHeight * 0.42;
  return { rollDeg, symmetry, faceHeight, browHair: marks.hairCover, maskFraction, inBrowZone };
}

export function judgeBrowPlacement(signals: BrowSignals): { ok: true } | { ok: false; reason: NonNullable<RegionReport["reason"]>; message: string } {
  if (signals.faceHeight < MIN_FACE) return { ok: false, reason: "small", message: TRY_ANOTHER_PHOTO };
  if (signals.rollDeg > BROW_ROLL_LIMIT) return { ok: false, reason: "tilt", message: FACE_TOO_TILTED };
  if (signals.symmetry < BROW_SYMMETRY_MIN) return { ok: false, reason: "profile", message: FACE_TOO_TURNED };
  if (signals.browHair > BROW_HAIR_MAX) return { ok: false, reason: "hair", message: BROWS_HIDDEN };
  if (signals.maskFraction < 0.002 || signals.maskFraction > 0.14) return { ok: false, reason: "area", message: TRY_ANOTHER_PHOTO };
  if (!signals.inBrowZone) return { ok: false, reason: "zone", message: TRY_ANOTHER_PHOTO };
  return { ok: true };
}

export type RegionReport = {
  ok: boolean;
  message: string;
  reason?: "none" | "many" | "tilt" | "profile" | "small" | "area" | "zone" | "hand" | "hair";
  width: number;
  height: number;
  face: FaceBox | null;
  mask: Uint8Array;
  feather: Uint8Array;
  raw: Buffer;
};

const MIN_FACE = 72;

function skinPixel(r: number, g: number, b: number, strict = false) {
  if (!(r > 90 && g > 40 && b > 20 && r > g && r > b && r - b > 12)) return false;
  // A beige wall is only a little warmer than grey. Real skin, including a medium
  // selfie, keeps a wider red-green gap. The loose check stays for blue-backed photos.
  return r - g > (strict ? 18 : 12);
}

function empty(width: number, height: number) {
  return new Uint8Array(width * height);
}

export async function decodeRgb(input: Buffer) {
  const { data, info } = await sharp(input, { failOn: "none" }).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function faceBlobs(data: Buffer, width: number, height: number, strict = false) {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 220));
  const sw = Math.ceil(width / step);
  const sh = Math.ceil(height / step);
  const skin = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      const sx = Math.min(width - 1, x * step);
      const sy = Math.min(height - 1, y * step);
      const i = (sy * width + sx) * 3;
      if (skinPixel(data[i], data[i + 1], data[i + 2], strict)) skin[y * sw + x] = 1;
    }
  }
  const labels = new Int32Array(sw * sh);
  const blobs: { count: number; sx: number; sy: number; minX: number; minY: number; maxX: number; maxY: number; xs: number[]; ys: number[] }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < skin.length; i += 1) {
    if (!skin[i] || labels[i]) continue;
    const id = blobs.length + 1;
    const blob = { count: 0, sx: 0, sy: 0, minX: sw, minY: sh, maxX: 0, maxY: 0, xs: [] as number[], ys: [] as number[] };
    stack.push(i);
    labels[i] = id;
    while (stack.length) {
      const cur = stack.pop()!;
      const x = cur % sw;
      const y = (cur - x) / sw;
      blob.count += 1;
      blob.sx += x;
      blob.sy += y;
      blob.xs.push(x);
      blob.ys.push(y);
      if (x < blob.minX) blob.minX = x;
      if (y < blob.minY) blob.minY = y;
      if (x > blob.maxX) blob.maxX = x;
      if (y > blob.maxY) blob.maxY = y;
      const neighbours = [cur - 1, cur + 1, cur - sw, cur + sw];
      for (const next of neighbours) {
        if (next < 0 || next >= skin.length || labels[next] || !skin[next]) continue;
        const nx = next % sw;
        if (Math.abs(nx - x) > 1) continue;
        labels[next] = id;
        stack.push(next);
      }
    }
    blobs.push(blob);
  }
  const area = sw * sh;
  const ranked = blobs
    .filter((blob) => blob.count > area * 0.02)
    .map((blob) => {
      const bw = blob.maxX - blob.minX + 1;
      const bh = blob.maxY - blob.minY + 1;
      const cx = blob.sx / blob.count;
      const cy = blob.sy / blob.count;
      let mu20 = 0;
      let mu02 = 0;
      let mu11 = 0;
      let agree = 0;
      for (let n = 0; n < blob.xs.length; n += 1) {
        const dx = blob.xs[n] - cx;
        const dy = blob.ys[n] - cy;
        mu20 += dx * dx;
        mu02 += dy * dy;
        mu11 += dx * dy;
        const mx = Math.round(2 * cx - blob.xs[n]);
        const my = blob.ys[n];
        if (mx >= 0 && mx < sw && skin[my * sw + mx]) agree += 1;
      }
      const deg = (0.5 * Math.atan2(2 * mu11, mu20 - mu02) * 180) / Math.PI;
      // Distance to the nearest upright axis. A wide skin blob (bangs, a close crop)
      // has a horizontal long axis and is not a rolled head. A real roll stays the
      // angle of that axis away from vertical.
      const fromVertical = Math.abs(Math.abs(deg) - 90);
      const tilt = Math.min(fromVertical, Math.abs(90 - fromVertical));
      const xs = [...blob.xs].sort((a, b) => a - b);
      const ys = [...blob.ys].sort((a, b) => a - b);
      const q = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
      return {
        count: blob.count,
        bw,
        bh,
        fill: blob.count / (bw * bh),
        tilt,
        symmetry: agree / blob.count,
        box: {
          x: q(xs, 0.04) * step,
          y: q(ys, 0.03) * step,
          w: (q(xs, 0.96) - q(xs, 0.04)) * step,
          h: (q(ys, 0.97) - q(ys, 0.03)) * step,
          cx: cx * step,
          cy: cy * step,
        } satisfies FaceBox,
      };
    })
    .filter((blob) => blob.fill > 0.32 && blob.bh / blob.bw > 0.42 && blob.bh / blob.bw < 3.6 && blob.count < area * 0.8)
    .sort((a, b) => b.count - a.count);
  const biggest = ranked[0]?.count ?? 0;
  const faces = ranked.filter((blob) => blob.count > biggest * 0.35);
  // A warm wall passes the loose skin check and swallows the face. Try again
  // with the stricter gap before giving up.
  if (!strict && faces.length === 0) {
    const swallowed = blobs.some((blob) => blob.count >= area * 0.8);
    if (swallowed) return faceBlobs(data, width, height, true);
  }
  return faces;
}

/**
 * Dark, low-saturation pixels that read as hair.
 * The MediaPipe hair segmenter weights are not shipped (see public/mediapipe/NOTICE.md),
 * so clothing is kept out with this colour check instead of that model.
 */
function hairLike(r: number, g: number, b: number) {
  if (skinPixel(r, g, b)) return false;
  if (b > r + 18 && b > g + 8) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum > 120) return false;
  if (max - min > 45 && lum > 45) return false;
  return lum < 95;
}

/**
 * Per-row horizontal span of face skin. Eyes, brows, and lips sit between the skin
 * on the same row, so the span covers them even though they are not skin-coloured.
 * Rows with only a sliver of skin are skipped.
 */
function faceSpans(data: Buffer, width: number, height: number, face: FaceBox) {
  const spans: { y: number; x0: number; x1: number }[] = [];
  const left = Math.max(0, Math.floor(face.x - face.w * 0.15));
  const right = Math.min(width - 1, Math.ceil(face.x + face.w * 1.15));
  const top = Math.max(0, Math.floor(face.y));
  const bottom = Math.min(height - 1, Math.ceil(face.y + face.h));
  for (let y = top; y <= bottom; y += 1) {
    let x0 = -1;
    let x1 = -1;
    let count = 0;
    for (let x = left; x <= right; x += 1) {
      const i = (y * width + x) * 3;
      if (!skinPixel(data[i], data[i + 1], data[i + 2])) continue;
      count += 1;
      if (x0 < 0) x0 = x;
      x1 = x;
    }
    if (count >= 6) spans.push({ y, x0, x1 });
  }
  return spans;
}

export type HairExtent = "short" | "medium" | "long";

export type RegionOptions = { hairExtent?: HairExtent };

/** How far a new cut may grow past the hair that is already in the photo. */
export function hairExtentForStyle(style: { id?: string; category?: string } | null | undefined, tool: RegionTool): HairExtent {
  if (tool === "colour") return "short";
  const category = style?.category || "";
  const id = style?.id || "";
  if (category === "short" || category === "crop" || category === "fade" || category === "taper" || /pixie|buzz|crew/.test(id)) return "short";
  if (category === "bob" || id === "lob" || id.endsWith("-lob")) return "medium";
  return "long";
}

function extentRadii(face: FaceBox, extent: HairExtent) {
  const cap = Math.max(8, Math.round(Math.min(face.w, face.h) * 0.28));
  if (extent === "short") {
    return { rx: Math.min(cap, Math.max(2, face.w * 0.04)), up: Math.min(cap, Math.max(2, face.h * 0.05)), down: Math.min(Math.round(cap * 0.35), Math.max(2, face.h * 0.035)) };
  }
  if (extent === "medium") {
    return { rx: Math.min(cap, Math.max(3, face.w * 0.07)), up: Math.min(cap, Math.max(3, face.h * 0.07)), down: Math.min(cap, Math.max(3, face.h * 0.1)) };
  }
  return { rx: Math.min(cap, Math.max(4, face.w * 0.09)), up: Math.min(cap, Math.max(4, face.h * 0.08)), down: Math.min(cap, Math.max(4, face.h * 0.2)) };
}

/** Grow the hair core sideways, a little upward, and downward by the style's length. */
function dilateHair(core: Uint8Array, width: number, height: number, rx: number, up: number, down: number) {
  const r = Math.max(0, Math.round(rx));
  const u = Math.max(0, Math.round(up));
  const d = Math.max(0, Math.round(down));
  const horiz = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width - 1, x + r);
      for (let k = x0; k <= x1; k += 1) {
        if (core[row + k]) {
          horiz[row + x] = 255;
          break;
        }
      }
    }
  }
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const y0 = Math.max(0, y - d);
      const y1 = Math.min(height - 1, y + u);
      for (let k = y0; k <= y1; k += 1) {
        if (horiz[k * width + x]) {
          out[y * width + x] = 255;
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Hair zone: hair-coloured pixels, plus a margin for the new length, minus the face.
 * A shorter style keeps the existing hair (so it can be removed) and adds little empty background.
 * A longer style may extend below the current ends. Plain background and shirt outside that margin stay out.
 */
function hairMask(mask: Uint8Array, width: number, height: number, face: FaceBox, data: Buffer, extent: HairExtent) {
  const cx = face.x + face.w / 2;
  const x0 = Math.max(0, Math.floor(cx - face.w * 2.2));
  const x1 = Math.min(width - 1, Math.ceil(cx + face.w * 2.2));
  const y0 = Math.max(0, Math.floor(face.y - face.h * 0.85));
  const y1 = Math.min(height - 1, Math.ceil(face.y + face.h * 3.1));
  const core = new Uint8Array(width * height);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * width + x) * 3;
      if (hairLike(data[i], data[i + 1], data[i + 2])) core[y * width + x] = 255;
    }
  }
  const radii = extentRadii(face, extent);
  const grown = dilateHair(core, width, height, radii.rx, radii.up, radii.down);
  grown.forEach((value, index) => {
    if (value) mask[index] = 255;
  });
  const margin = Math.max(2, Math.round(face.w * 0.03));
  for (const span of faceSpans(data, width, height, face)) {
    const a = Math.max(0, span.x0 - margin);
    const b = Math.min(width - 1, span.x1 + margin);
    for (let y = Math.max(0, span.y - 1); y <= Math.min(height - 1, span.y + 1); y += 1) {
      for (let x = a; x <= b; x += 1) mask[y * width + x] = 0;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (!mask[p]) continue;
      const i = p * 3;
      if (skinPixel(data[i], data[i + 1], data[i + 2])) mask[p] = 0;
    }
  }
}

export function primaryFace(data: Buffer, width: number, height: number): FaceBox | null {
  const blobs = faceBlobs(data, width, height);
  if (blobs.length !== 1) return null;
  return blobs[0].box;
}

/** Tilt and symmetry of the single skin blob. Tests use this to see why a selfie was refused. */
export function facePose(data: Buffer, width: number, height: number) {
  const blobs = faceBlobs(data, width, height);
  return blobs.map((blob) => ({ tilt: blob.tilt, symmetry: blob.symmetry, h: blob.box.h, w: blob.box.w }));
}

function browRect(face: FaceBox, width: number, height: number) {
  return {
    y0: Math.max(0, Math.floor(face.y + face.h * 0.2)),
    y1: Math.min(height - 1, Math.ceil(face.y + face.h * 0.36)),
    x0: Math.max(0, Math.floor(face.x + face.w * 0.12)),
    x1: Math.min(width - 1, Math.ceil(face.x + face.w * 0.88)),
  };
}

function browMask(mask: Uint8Array, width: number, height: number, face: FaceBox) {
  const { y0, y1, x0, x1 } = browRect(face, width, height);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) mask[y * width + x] = 255;
  }
}

/** Hair-coloured pixels inside the brow band. Glasses and a partial fringe stay under the limit. */
export function browBandHair(data: Buffer, width: number, height: number, face: FaceBox) {
  const { y0, y1, x0, x1 } = browRect(face, width, height);
  let hair = 0;
  let total = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      total += 1;
      const i = (y * width + x) * 3;
      if (hairLike(data[i], data[i + 1], data[i + 2])) hair += 1;
    }
  }
  if (!total) return 0;
  return hair / total;
}

function beardMask(mask: Uint8Array, width: number, height: number, face: FaceBox) {
  const y0 = face.y + face.h * 0.6;
  const y1 = face.y + face.h * 1.12;
  const cx = face.x + face.w / 2;
  const mouthY = face.y + face.h * 0.73;
  const mouthRx = face.w * 0.16;
  const mouthRy = face.h * 0.055;
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(height - 1, Math.ceil(y1)); y += 1) {
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    const half = face.w * (0.4 - 0.1 * t);
    for (let x = Math.max(0, Math.floor(cx - half)); x <= Math.min(width - 1, Math.ceil(cx + half)); x += 1) {
      const dx = (x - cx) / mouthRx;
      const dy = (y - mouthY) / mouthRy;
      if (dx * dx + dy * dy <= 1) continue;
      mask[y * width + x] = 255;
    }
  }
}

function skinGrid(data: Buffer, width: number, height: number) {
  const skin = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 3;
    if (skinPixel(data[o], data[o + 1], data[o + 2])) skin[i] = 1;
  }
  return skin;
}

export function fingertipBoxes(skin: Uint8Array, width: number, height: number) {
  let minY = height;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!skin[y * width + x]) continue;
      count += 1;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!count) return [];
  const top = new Int16Array(width).fill(-1);
  const tops: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (skin[y * width + x] && top[x] < 0) top[x] = y;
    }
  }
  for (let x = 0; x < width; x += 1) if (top[x] >= 0) tops.push(top[x]);
  const peak = tops.length ? Math.min(...tops) : minY;
  const cut = peak + Math.max(28, (maxY - minY) * 0.12);
  const groups: { x0: number; x1: number; top: number }[] = [];
  let start = -1;
  for (let x = 0; x <= width; x += 1) {
    const on = x < width && top[x] >= 0 && top[x] <= cut;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      const x1 = x - 1;
      const span = x1 - start + 1;
      if (span >= 6 && span < width * 0.22) {
        let peak = height;
        for (let i = start; i <= x1; i += 1) if (top[i] < peak) peak = top[i];
        groups.push({ x0: start, x1, top: peak });
      }
      start = -1;
    }
  }
  return groups;
}

function nailMask(mask: Uint8Array, data: Buffer, width: number, height: number) {
  const skin = skinGrid(data, width, height);
  const tips = fingertipBoxes(skin, width, height);
  if (tips.length >= 3) {
    for (const tip of tips) {
      const depth = 42;
      for (let y = Math.max(0, tip.top - 48); y <= Math.min(height - 1, tip.top + depth); y += 1) {
        for (let x = tip.x0; x <= tip.x1; x += 1) mask[y * width + x] = 255;
      }
    }
    return;
  }
  skin.forEach((on, i) => {
    if (on) mask[i] = 255;
  });
}

export function featherMask(hard: Uint8Array, width: number, height: number, radius: number) {
  const tmp = new Float32Array(width * height);
  const out = new Uint8Array(width * height);
  const win = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += hard[y * width + Math.min(width - 1, Math.max(0, k))];
    for (let x = 0; x < width; x += 1) {
      tmp[y * width + x] = sum / win;
      sum -= hard[y * width + Math.min(width - 1, Math.max(0, x - radius))];
      sum += hard[y * width + Math.min(width - 1, Math.max(0, x + radius + 1))];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += tmp[Math.min(height - 1, Math.max(0, k)) * width + x];
    for (let y = 0; y < height; y += 1) {
      const value = sum / win;
      out[y * width + x] = value <= 0.5 ? 0 : value >= 254.5 ? 255 : Math.round(value);
      sum -= tmp[Math.min(height - 1, Math.max(0, y - radius)) * width + x];
      sum += tmp[Math.min(height - 1, Math.max(0, y + radius + 1)) * width + x];
    }
  }
  return out;
}

function maskBox(mask: Uint8Array, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      count += 1;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!count) return null;
  return { count, minX, minY, maxX, maxY, cx: sx / count, cy: sy / count };
}

function zoneOk(tool: RegionTool, face: FaceBox, box: NonNullable<ReturnType<typeof maskBox>>) {
  if (tool === "style" || tool === "colour") {
    return box.minY <= face.y + face.h * 0.08;
  }
  if (tool === "brows") {
    return box.cy > face.y + face.h * 0.14 && box.cy < face.y + face.h * 0.46 && box.maxX - box.minX < face.w * 1.2;
  }
  return box.minY > face.y + face.h * 0.5 && box.cx > face.x - face.w * 0.15 && box.cx < face.x + face.w * 1.15;
}

const AREA: Record<RegionTool, [number, number]> = {
  style: [0.015, 0.8],
  colour: [0.015, 0.8],
  brows: [0.002, 0.14],
  beard: [0.012, 0.3],
  nails: [0.008, 0.4],
};

function fail(partial: Omit<RegionReport, "ok" | "message" | "feather"> & { reason: RegionReport["reason"]; message?: string }): RegionReport {
  const message = partial.message || TRY_ANOTHER_PHOTO;
  return { ...partial, ok: false, message, feather: empty(partial.width, partial.height) };
}

export function analyzeRegion(data: Buffer, width: number, height: number, tool: RegionTool, options?: RegionOptions): RegionReport {
  const mask = empty(width, height);
  const base = { width, height, raw: data, mask, face: null as FaceBox | null };
  if (tool === "nails") {
    const small = Buffer.alloc(48 * 48 * 3);
    for (let y = 0; y < 48; y += 1) {
      for (let x = 0; x < 48; x += 1) {
        const sx = Math.min(width - 1, Math.floor((x / 48) * width));
        const sy = Math.min(height - 1, Math.floor((y / 48) * height));
        const si = (sy * width + sx) * 3;
        const di = (y * 48 + x) * 3;
        small[di] = data[si];
        small[di + 1] = data[si + 1];
        small[di + 2] = data[si + 2];
      }
    }
    if (classifySkinPhoto(small, 48, 48, 3) === "face") return fail({ ...base, reason: "hand" });
    nailMask(mask, data, width, height);
  } else {
    const blobs = faceBlobs(data, width, height);
    const skin = skinGrid(data, width, height);
    if (fingertipBoxes(skin, width, height).length >= 3) return fail({ ...base, reason: "hand" });
    if (blobs.length === 0) {
      return fail({
        ...base,
        reason: "none",
        message: tool === "brows" ? "We couldn't find a face. Use a front-facing photo and try again." : undefined,
      });
    }
    if (blobs.length >= 2) return fail({ ...base, reason: "many" });
    const blob = blobs[0];
    const face = blob.box;
    base.face = face;
    if (tool === "brows") browMask(mask, width, height, face);
    else if (tool === "beard") beardMask(mask, width, height, face);
    else hairMask(mask, width, height, face, data, options?.hairExtent ?? (tool === "colour" ? "short" : "long"));
    if (tool === "brows") {
      const box = maskBox(mask, width, height);
      const fraction = box ? box.count / (width * height) : 0;
      const judged = judgeBrowPlacement({
        rollDeg: blob.tilt,
        symmetry: blob.symmetry,
        faceHeight: face.h,
        browHair: browBandHair(data, width, height, face),
        maskFraction: fraction,
        inBrowZone: Boolean(box && zoneOk("brows", face, box)),
      });
      if (!judged.ok) return fail({ ...base, face, reason: judged.reason, message: judged.message });
    } else {
      if (face.h < MIN_FACE) return fail({ ...base, face, reason: "small" });
      if (blob.tilt > 18) return fail({ ...base, face, reason: "tilt" });
      if (blob.symmetry < 0.86) return fail({ ...base, face, reason: "profile" });
    }
  }
  const box = maskBox(mask, width, height);
  const fraction = box ? box.count / (width * height) : 0;
  const [minArea, maxArea] = AREA[tool];
  if (!box || fraction < minArea || fraction > maxArea) return fail({ ...base, reason: "area" });
  if (base.face && !zoneOk(tool, base.face, box)) return fail({ ...base, reason: "zone" });
  const radius = Math.max(2, Math.min(6, Math.round((base.face?.h ?? height) / 90)));
  return { ...base, ok: true, message: "", feather: featherMask(mask, width, height, radius) };
}

export function disallowedChange(tool: RegionTool, face: FaceBox | null, changed: Uint8Array, width: number, height: number) {
  if (!face || tool === "nails") return 0;
  let bad = 0;
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!changed[y * width + x]) continue;
      total += 1;
      const ny = (y - face.y) / face.h;
      const nx = (x - face.x) / face.w;
      const inFaceX = nx > -0.05 && nx < 1.05;
      const forehead = inFaceX && ny > 0 && ny < 0.18;
      const eyes = inFaceX && ny > 0.34 && ny < 0.48;
      const beard = inFaceX && ny > 0.62 && ny < 1;
      if (tool === "beard" && (forehead || eyes)) bad += 1;
      if ((tool === "style" || tool === "colour") && beard) bad += 1;
      if (tool === "brows" && (beard || ny < 0.12)) bad += 1;
    }
  }
  if (!total) return 0;
  return bad / total;
}

export async function renderOverlay(raw: Buffer, width: number, height: number, mask: Uint8Array, face: FaceBox | null) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 3;
    let r = raw[o];
    let g = raw[o + 1];
    let b = raw[o + 2];
    if (mask[i]) {
      r = Math.round(r * 0.45 + 220 * 0.55);
      g = Math.round(g * 0.45 + 48 * 0.55);
      b = Math.round(b * 0.45 + 48 * 0.55);
    }
    const p = i * 4;
    rgba[p] = r;
    rgba[p + 1] = g;
    rgba[p + 2] = b;
    rgba[p + 3] = 255;
  }
  if (face) {
    const draw = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const p = (y * width + x) * 4;
      rgba[p] = 36;
      rgba[p + 1] = 170;
      rgba[p + 2] = 96;
    };
    for (let x = Math.floor(face.x); x <= Math.ceil(face.x + face.w); x += 1) {
      draw(x, Math.floor(face.y));
      draw(x, Math.ceil(face.y + face.h));
    }
    for (let y = Math.floor(face.y); y <= Math.ceil(face.y + face.h); y += 1) {
      draw(Math.floor(face.x), y);
      draw(Math.ceil(face.x + face.w), y);
    }
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

export async function maskPng(feather: Uint8Array, width: number, height: number) {
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < feather.length; i += 1) rgba[i * 4 + 3] = 255 - feather[i];
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Pixels with a feather of 0 stay byte-identical to the original. */
export function compositeLocked(original: Buffer, edited: Buffer, feather: Uint8Array) {
  const out = Buffer.alloc(original.length);
  for (let i = 0; i < feather.length; i += 1) {
    const o = i * 3;
    const alpha = feather[i];
    if (alpha === 0) {
      out[o] = original[o];
      out[o + 1] = original[o + 1];
      out[o + 2] = original[o + 2];
    } else if (alpha === 255) {
      out[o] = edited[o];
      out[o + 1] = edited[o + 1];
      out[o + 2] = edited[o + 2];
    } else {
      const scale = alpha / 255;
      out[o] = Math.round(original[o] * (1 - scale) + edited[o] * scale);
      out[o + 1] = Math.round(original[o + 1] * (1 - scale) + edited[o + 1] * scale);
      out[o + 2] = Math.round(original[o + 2] * (1 - scale) + edited[o + 2] * scale);
    }
  }
  return out;
}

/** Mean per-channel absolute difference across brows, eyes, and the nose. */
export function faceRegionDelta(original: Buffer, next: Buffer, face: FaceBox, width: number, height: number) {
  const bands: [number, number][] = [
    [0.18, 0.36],
    [0.34, 0.5],
    [0.42, 0.62],
  ];
  const x0 = Math.max(0, Math.floor(face.x + face.w * 0.15));
  const x1 = Math.min(width - 1, Math.ceil(face.x + face.w * 0.85));
  let sum = 0;
  let count = 0;
  for (const [start, end] of bands) {
    const y0 = Math.max(0, Math.floor(face.y + face.h * start));
    const y1 = Math.min(height - 1, Math.ceil(face.y + face.h * end));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const o = (y * width + x) * 3;
        sum += Math.abs(original[o] - next[o]) + Math.abs(original[o + 1] - next[o + 1]) + Math.abs(original[o + 2] - next[o + 2]);
        count += 3;
      }
    }
  }
  if (!count) return 0;
  return sum / count;
}

export async function preflightPhoto(jpeg: Buffer, tool: RegionTool, options?: RegionOptions) {
  const decoded = await decodeRgb(jpeg);
  const report = analyzeRegion(decoded.data, decoded.width, decoded.height, tool, options);
  return { ...report, maskFile: report.ok ? await maskPng(report.feather, report.width, report.height) : null };
}
