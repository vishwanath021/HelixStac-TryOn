/** Synthetic portraits with a known face box. Used by the offline placement tests. */

export type RGB = { r: number; g: number; b: number };

export const BG: RGB = { r: 32, g: 58, b: 168 };
export const SKIN: RGB = { r: 214, g: 164, b: 132 };
export const HAIR: RGB = { r: 42, g: 30, b: 24 };
export const FEATURE: RGB = { r: 62, g: 36, b: 32 };
export const NAIL: RGB = { r: 176, g: 36, b: 48 };

export type FaceMark = { x: number; y: number; w: number; h: number };

export type Scene = {
  name: string;
  data: Buffer;
  width: number;
  height: number;
  face: FaceMark | null;
  /** Nail rectangles that are not skin-coloured, sitting on the fingertips. */
  nails: FaceMark[];
};

function put(data: Buffer, w: number, x: number, y: number, h: number, color: RGB) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = (y * w + x) * 3;
  data[i] = color.r;
  data[i + 1] = color.g;
  data[i + 2] = color.b;
}

export function blank(width: number, height: number, color: RGB = BG) {
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 3] = color.r;
    data[i * 3 + 1] = color.g;
    data[i * 3 + 2] = color.b;
  }
  return data;
}

export function fillEllipse(
  data: Buffer,
  width: number,
  height: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: RGB,
  rotationDeg = 0,
  clip?: (x: number, y: number) => boolean,
) {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const pad = Math.ceil(Math.max(rx, ry) + 2);
  for (let y = Math.max(0, Math.floor(cy - pad)); y <= Math.min(height - 1, Math.ceil(cy + pad)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - pad)); x <= Math.min(width - 1, Math.ceil(cx + pad)); x += 1) {
      if (clip && !clip(x, y)) continue;
      const dx = x - cx;
      const dy = y - cy;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      if ((lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1) put(data, width, x, y, height, color);
    }
  }
}

function fillRect(data: Buffer, width: number, height: number, x0: number, y0: number, x1: number, y1: number, color: RGB) {
  for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y += 1) {
    for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x += 1) put(data, width, x, y, height, color);
  }
}

/** Upright frontal face. `face` is the skin oval's bounding box. */
export function drawFrontal(width: number, height: number, cxRatio = 0.5, cyRatio = 0.46, scale = 1): Scene {
  const data = blank(width, height);
  const cx = Math.round(width * cxRatio);
  const cy = Math.round(height * cyRatio);
  const unit = Math.min(width, height);
  const rx = Math.round(unit * 0.16 * scale);
  const ry = Math.round(unit * 0.22 * scale);
  fillEllipse(data, width, height, cx, cy - Math.round(ry * 1.05), Math.round(rx * 1.25), Math.round(ry * 0.55), HAIR);
  fillEllipse(data, width, height, cx, cy, rx, ry, SKIN);
  fillEllipse(data, width, height, cx - Math.round(rx * 0.38), cy - Math.round(ry * 0.12), Math.round(rx * 0.12), Math.round(ry * 0.06), FEATURE);
  fillEllipse(data, width, height, cx + Math.round(rx * 0.38), cy - Math.round(ry * 0.12), Math.round(rx * 0.12), Math.round(ry * 0.06), FEATURE);
  fillEllipse(data, width, height, cx, cy + Math.round(ry * 0.38), Math.round(rx * 0.22), Math.round(ry * 0.07), FEATURE);
  return {
    name: "frontal",
    data,
    width,
    height,
    face: { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 },
    nails: [],
  };
}

export function drawProfile(width = 480, height = 640): Scene {
  const base = drawFrontal(width, height);
  const face = base.face!;
  const cx = face.x + face.w / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = cx; x < width; x += 1) {
      const i = (y * width + x) * 3;
      base.data[i] = BG.r;
      base.data[i + 1] = BG.g;
      base.data[i + 2] = BG.b;
    }
  }
  return { ...base, name: "profile", face: { x: face.x, y: face.y, w: Math.round(face.w / 2), h: face.h } };
}

export function drawTilted(width = 480, height = 640): Scene {
  const data = blank(width, height);
  const cx = Math.round(width * 0.5);
  const cy = Math.round(height * 0.46);
  const rx = Math.round(width * 0.18);
  const ry = Math.round(height * 0.2);
  fillEllipse(data, width, height, cx, cy, rx, ry, SKIN, 28);
  return { name: "tilted", data, width, height, face: { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 }, nails: [] };
}

export function drawTwoFaces(width = 480, height = 640): Scene {
  const data = blank(width, height);
  fillEllipse(data, width, height, Math.round(width * 0.28), Math.round(height * 0.48), Math.round(width * 0.13), Math.round(height * 0.16), SKIN);
  fillEllipse(data, width, height, Math.round(width * 0.72), Math.round(height * 0.48), Math.round(width * 0.13), Math.round(height * 0.16), SKIN);
  return { name: "two-face", data, width, height, face: null, nails: [] };
}

export function drawHand(width = 480, height = 640): Scene {
  const data = blank(width, height);
  const fingers = [24, 110, 196, 282, 368];
  const nails: FaceMark[] = [];
  for (const x of fingers) {
    fillRect(data, width, height, x, 150, x + 48, 320, SKIN);
    fillRect(data, width, height, x + 6, 108, x + 42, 148, NAIL);
    nails.push({ x: x + 6, y: 108, w: 36, h: 40 });
  }
  fillRect(data, width, height, 0, 300, width - 1, 560, SKIN);
  return { name: "hand", data, width, height, face: null, nails };
}

export function rotateCcw(scene: Scene): Scene {
  const { data, width, height } = scene;
  const next = Buffer.alloc(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = y;
      const ny = width - 1 - x;
      const si = (y * width + x) * 3;
      const di = (ny * height + nx) * 3;
      next[di] = data[si];
      next[di + 1] = data[si + 1];
      next[di + 2] = data[si + 2];
    }
  }
  return { ...scene, name: `${scene.name}-ccw`, data: next, width: height, height: width, face: null, nails: [] };
}
