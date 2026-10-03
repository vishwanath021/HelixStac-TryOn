import sharp from "sharp";
import { classifySkinPhoto } from "@/lib/hand-photo";

export const TRY_ANOTHER_PHOTO = "Try another photo. We couldn't place this look safely on this picture.";

export type RegionTool = "style" | "colour" | "brows" | "beard" | "nails";

export type FaceBox = { x: number; y: number; w: number; h: number; cx: number; cy: number };

export type RegionReport = {
  ok: boolean;
  message: string;
  reason?: "none" | "many" | "tilt" | "profile" | "small" | "area" | "zone" | "hand";
  width: number;
  height: number;
  face: FaceBox | null;
  mask: Uint8Array;
  feather: Uint8Array;
  raw: Buffer;
};

const MIN_FACE = 72;

function skinPixel(r: number, g: number, b: number) {
  return r > 90 && g > 40 && b > 20 && r > g && r > b && r - g > 12 && r - b > 12;
}

function empty(width: number, height: number) {
  return new Uint8Array(width * height);
}

export async function decodeRgb(input: Buffer) {
  const { data, info } = await sharp(input, { failOn: "none" }).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function faceBlobs(data: Buffer, width: number, height: number) {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 220));
  const sw = Math.ceil(width / step);
  const sh = Math.ceil(height / step);
  const skin = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      const sx = Math.min(width - 1, x * step);
      const sy = Math.min(height - 1, y * step);
      const i = (sy * width + sx) * 3;
      if (skinPixel(data[i], data[i + 1], data[i + 2])) skin[y * sw + x] = 1;
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
      const tilt = Math.abs(Math.abs(deg) - 90);
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
    .filter((blob) => blob.fill > 0.32 && blob.bh / blob.bw > 0.7 && blob.bh / blob.bw < 3.6 && blob.count < area * 0.8)
    .sort((a, b) => b.count - a.count);
  const biggest = ranked[0]?.count ?? 0;
  return ranked.filter((blob) => blob.count > biggest * 0.35);
}

function stampEllipse(mask: Uint8Array, width: number, height: number, cx: number, cy: number, rx: number, ry: number, value = 255) {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(height - 1, Math.ceil(cy + ry)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(width - 1, Math.ceil(cx + rx)); x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) mask[y * width + x] = value;
    }
  }
}

function hairMask(mask: Uint8Array, width: number, height: number, face: FaceBox) {
  const cx = face.x + face.w / 2;
  stampEllipse(mask, width, height, cx, face.y - face.h * 0.02, face.w * 0.72, face.h * 0.4);
  const y1 = face.y + face.h * 0.42;
  for (let y = Math.max(0, Math.floor(face.y)); y <= Math.min(height - 1, Math.ceil(y1)); y += 1) {
    for (let side = 0; side < 2; side += 1) {
      const x0 = side === 0 ? face.x - face.w * 0.22 : face.x + face.w * 0.78;
      const x1 = side === 0 ? face.x + face.w * 0.16 : face.x + face.w * 1.22;
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(width - 1, Math.ceil(x1)); x += 1) mask[y * width + x] = 255;
    }
  }
}

function browMask(mask: Uint8Array, width: number, height: number, face: FaceBox) {
  const y0 = Math.floor(face.y + face.h * 0.22);
  const y1 = Math.ceil(face.y + face.h * 0.33);
  const x0 = Math.floor(face.x + face.w * 0.14);
  const x1 = Math.ceil(face.x + face.w * 0.86);
  for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y += 1) {
    for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x += 1) mask[y * width + x] = 255;
  }
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
    return box.cy < face.y + face.h * 0.34 && box.minY <= face.y + face.h * 0.08 && box.maxY < face.y + face.h * 0.55;
  }
  if (tool === "brows") {
    return box.cy > face.y + face.h * 0.18 && box.cy < face.y + face.h * 0.4 && box.maxX - box.minX < face.w * 1.15;
  }
  return box.minY > face.y + face.h * 0.5 && box.cx > face.x - face.w * 0.15 && box.cx < face.x + face.w * 1.15;
}

const AREA: Record<RegionTool, [number, number]> = {
  style: [0.015, 0.42],
  colour: [0.015, 0.42],
  brows: [0.002, 0.09],
  beard: [0.012, 0.3],
  nails: [0.008, 0.4],
};

function fail(partial: Omit<RegionReport, "ok" | "message" | "feather"> & { reason: RegionReport["reason"] }): RegionReport {
  return { ...partial, ok: false, message: TRY_ANOTHER_PHOTO, feather: empty(partial.width, partial.height) };
}

export function analyzeRegion(data: Buffer, width: number, height: number, tool: RegionTool): RegionReport {
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
    if (blobs.length === 0) return fail({ ...base, reason: "none" });
    if (blobs.length >= 2) return fail({ ...base, reason: "many" });
    const blob = blobs[0];
    const face = blob.box;
    if (face.h < MIN_FACE) return fail({ ...base, face, reason: "small" });
    if (blob.tilt > 18) return fail({ ...base, face, reason: "tilt" });
    if (blob.symmetry < 0.86) return fail({ ...base, face, reason: "profile" });
    if (tool === "brows") browMask(mask, width, height, face);
    else if (tool === "beard") beardMask(mask, width, height, face);
    else hairMask(mask, width, height, face);
    base.face = face;
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
      const beard = inFaceX && ny > 0.62;
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

export async function preflightPhoto(jpeg: Buffer, tool: RegionTool) {
  const decoded = await decodeRgb(jpeg);
  const report = analyzeRegion(decoded.data, decoded.width, decoded.height, tool);
  return { ...report, maskFile: report.ok ? await maskPng(report.feather, report.width, report.height) : null };
}
