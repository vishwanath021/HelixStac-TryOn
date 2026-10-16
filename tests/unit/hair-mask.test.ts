import { describe, expect, it } from "vitest";
import { EAR_LEFT, EAR_RIGHT, FACE_OVAL, LEFT_BROW, LEFT_EYE, RIGHT_BROW, RIGHT_EYE } from "@/lib/face/landmarks";
import { buildHairMask, dyeHairColor, liftHairLuma, pixelIsHair } from "@/lib/face/hair-mask";

function placeBrows(points: { x: number; y: number }[], y: number) {
  for (const index of [...LEFT_BROW, ...RIGHT_BROW]) points[index] = { x: 0.5, y };
}

/** A head whose hair gate covers this frame. The face oval stays a small blob at the bottom. */
function headOver(frame: { width: number; height: number }) {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.86 }));
  points[10] = { x: 0.5, y: 0.15 };
  points[152] = { x: 0.5, y: 0.98 };
  points[EAR_LEFT] = { x: 0.02, y: 0.4 };
  points[EAR_RIGHT] = { x: 0.98, y: 0.4 };
  placeBrows(points, 0.9);
  return points;
}

function blank(width: number, height: number) {
  return {
    category: new Uint8Array(width * height),
    hairConf: new Float32Array(width * height),
    faceSkinConf: new Float32Array(width * height),
  };
}

function paint(
  field: { category: Uint8Array; hairConf: Float32Array; faceSkinConf: Float32Array },
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  hair: number,
  category: number,
  faceSkin = 0,
) {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = y * width + x;
      field.hairConf[i] = hair;
      field.category[i] = category;
      field.faceSkinConf[i] = faceSkin;
    }
  }
}

describe("hair colour mask", () => {
  it("keeps confident hair and rejects skin, the face oval, and scores under 0.42", () => {
    const width = 48;
    const height = 48;
    const field = blank(width, height);
    paint(field, width, 16, 1, 32, 10, 0.92, 1);
    paint(field, width, 1, 30, 16, 46, 0.3, 1);
    paint(field, width, 20, 20, 30, 30, 0.98, 1);
    paint(field, width, 32, 2, 46, 16, 0.95, 3, 0.8);
    const points = Array.from({ length: 478 }, () => ({ x: 0.05, y: 0.05 }));
    FACE_OVAL.forEach((index, step) => {
      const angle = (step / FACE_OVAL.length) * Math.PI * 2;
      points[index] = { x: 0.5 + Math.cos(angle) * 0.22, y: 0.5 + Math.sin(angle) * 0.22 };
    });
    placeBrows(points, 0.34);
    points[EAR_LEFT] = { x: 0.18, y: 0.48 };
    points[EAR_RIGHT] = { x: 0.82, y: 0.48 };
    points[10] = { x: 0.5, y: 0.3 };
    points[152] = { x: 0.5, y: 0.72 };
    const packed = buildHairMask({ width, height, ...field, points });
    const alpha = (x: number, y: number) => packed[(y * width + x) * 4] ?? 0;
    expect(alpha(24, 4)).toBeGreaterThan(180);
    expect(alpha(4, 38)).toBe(0);
    expect(alpha(25, 25)).toBe(0);
    expect(alpha(38, 8)).toBe(0);
    expect(packed[(4 * width + 24) * 4 + 1]).toBe(0);
    expect(packed[(8 * width + 38) * 4 + 1]).toBe(255);
  });

  it("rejects a smooth light scalp and keeps dark hair", () => {
    const width = 24;
    const height = 16;
    const rgb = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      const scalp = i % width < 12;
      rgb[i * 4] = scalp ? 168 : 28;
      rgb[i * 4 + 1] = scalp ? 150 : 22;
      rgb[i * 4 + 2] = scalp ? 140 : 18;
      rgb[i * 4 + 3] = 255;
    }
    const scalp = 8 * width + 4;
    const hair = 8 * width + 18;
    const grey = 8 * width + 6;
    rgb[grey * 4] = 78;
    rgb[grey * 4 + 1] = 78;
    rgb[grey * 4 + 2] = 78;
    expect(pixelIsHair(rgb, width, height, scalp)).toBe(false);
    expect(pixelIsHair(rgb, width, height, grey)).toBe(false);
    expect(pixelIsHair(rgb, width, height, hair)).toBe(true);
    const category = new Uint8Array(width * height);
    const hairConf = new Float32Array(width * height);
    category.fill(1);
    hairConf.fill(0.95);
    const packed = buildHairMask({
      width,
      height,
      category,
      hairConf,
      faceSkinConf: new Float32Array(width * height),
      points: headOver({ width, height }),
      rgb,
    });
    expect(packed[scalp * 4]).toBe(0);
    expect(packed[hair * 4]).toBeGreaterThan(180);
  });

  it("keeps dim dark hair under the old 0.6 cutoff and fills a small hole", () => {
    const width = 40;
    const height = 32;
    const rgb = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      const pale = i % width < 12;
      rgb[i * 4] = pale ? 210 : 32;
      rgb[i * 4 + 1] = pale ? 186 : 26;
      rgb[i * 4 + 2] = pale ? 170 : 20;
      rgb[i * 4 + 3] = 255;
    }
    const pale = 8 * width + 4;
    const dark = 8 * width + 28;
    expect(pixelIsHair(rgb, width, height, pale)).toBe(false);
    expect(pixelIsHair(rgb, width, height, dark)).toBe(true);
    const category = new Uint8Array(width * height);
    const hairConf = new Float32Array(width * height);
    for (let i = 0; i < width * height; i += 1) {
      if (i % width < 12) continue;
      category[i] = 1;
      hairConf[i] = 0.45;
    }
    const hole = 10 * width + 28;
    hairConf[hole] = 0;
    category[hole] = 0;
    const packed = buildHairMask({
      width,
      height,
      category,
      hairConf,
      faceSkinConf: new Float32Array(width * height),
      points: headOver({ width, height }),
      rgb,
    });
    expect(packed[pale * 4]).toBe(0);
    expect(packed[dark * 4]).toBeGreaterThan(80);
    expect(packed[hole * 4]).toBeGreaterThan(80);
  });

  it("leaves the background, forehead skin, and eyes unchanged on the dim-hair path", () => {
    const width = 80;
    const height = 80;
    const rgb = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      rgb[i * 4] = 28;
      rgb[i * 4 + 1] = 22;
      rgb[i * 4 + 2] = 18;
      rgb[i * 4 + 3] = 255;
    }
    const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.7 }));
    FACE_OVAL.forEach((index, step) => {
      const angle = (step / FACE_OVAL.length) * Math.PI * 2;
      points[index] = { x: 0.5 + Math.cos(angle) * 0.16, y: 0.58 + Math.sin(angle) * 0.16 };
    });
    placeBrows(points, 0.46);
    const eyeAt = (indexes: readonly number[], cx: number, cy: number) => {
      indexes.forEach((index, step) => {
        const angle = (step / indexes.length) * Math.PI * 2;
        points[index] = { x: cx + Math.cos(angle) * 0.04, y: cy + Math.sin(angle) * 0.03 };
      });
    };
    eyeAt(LEFT_EYE, 0.62, 0.5);
    eyeAt(RIGHT_EYE, 0.38, 0.5);
    points[EAR_LEFT] = { x: 0.3, y: 0.55 };
    points[EAR_RIGHT] = { x: 0.7, y: 0.55 };
    points[10] = { x: 0.5, y: 0.44 };
    points[152] = { x: 0.5, y: 0.74 };
    const category = new Uint8Array(width * height);
    const hairConf = new Float32Array(width * height);
    category.fill(1);
    hairConf.fill(0.45);
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 10; x += 1) {
        category[y * width + x] = 0;
        hairConf[y * width + x] = 0;
        category[y * width + (width - 1 - x)] = 0;
        hairConf[y * width + (width - 1 - x)] = 0;
      }
    }
    const packed = buildHairMask({
      width,
      height,
      category,
      hairConf,
      faceSkinConf: new Float32Array(width * height),
      points,
      rgb,
    });
    const alpha = (x: number, y: number) => packed[(y * width + x) * 4] ?? 0;
    const dyed = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      const cover = (packed[i] ?? 0) / 255;
      return [0, 1, 2].map((channel) => Math.round((rgb[i + channel] ?? 0) * (1 - cover) + 180 * cover));
    };
    for (const [x, y] of [[2, 2], [76, 4], [40, 46], [50, 40]] as const) {
      expect(alpha(x, y), `${x},${y}`).toBe(0);
      expect(dyed(x, y), `${x},${y}`).toEqual([28, 22, 18]);
    }
    expect(alpha(40, 8)).toBeGreaterThan(80);
  });

  it("colours hair-class pixels below the chin", () => {
    const width = 64;
    const height = 96;
    const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.36 }));
    FACE_OVAL.forEach((index, step) => {
      const angle = (step / FACE_OVAL.length) * Math.PI * 2;
      points[index] = { x: 0.5 + Math.cos(angle) * 0.14, y: 0.34 + Math.sin(angle) * 0.14 };
    });
    points[152] = { x: 0.5, y: 0.48 };
    const rgb = new Uint8ClampedArray(width * height * 4);
    const category = new Uint8Array(width * height);
    const hairConf = new Float32Array(width * height);
    for (let i = 0; i < width * height; i += 1) {
      rgb[i * 4] = 24;
      rgb[i * 4 + 1] = 18;
      rgb[i * 4 + 2] = 14;
      rgb[i * 4 + 3] = 255;
      category[i] = 1;
      hairConf[i] = 0.86;
    }
    const packed = buildHairMask({
      width,
      height,
      category,
      hairConf,
      faceSkinConf: new Float32Array(width * height),
      points,
      rgb,
    });
    const alpha = (x: number, y: number) => packed[(y * width + x) * 4] ?? 0;
    const chinY = Math.round(0.48 * height);
    expect(chinY).toBeGreaterThan(40);
    expect(alpha(8, chinY + 16)).toBeGreaterThan(80);
    expect(alpha(56, chinY + 20)).toBeGreaterThan(80);
    expect(alpha(32, Math.round(0.34 * height))).toBe(0);
  });

  it("drops isolated blobs on a scalp", () => {
    const width = 80;
    const height = 48;
    const rgb = new Uint8ClampedArray(width * height * 4);
    rgb.fill(255);
    for (let i = 0; i < width * height; i += 1) {
      rgb[i * 4] = 30;
      rgb[i * 4 + 1] = 28;
      rgb[i * 4 + 2] = 26;
    }
    const category = new Uint8Array(width * height);
    const hairConf = new Float32Array(width * height);
    for (let y = 4; y < 36; y += 1) {
      for (let x = 4; x < 36; x += 1) {
        const i = y * width + x;
        category[i] = 1;
        hairConf[i] = 0.9;
      }
    }
    for (let y = 8; y < 10; y += 1) {
      for (let x = 70; x < 72; x += 1) {
        const i = y * width + x;
        category[i] = 1;
        hairConf[i] = 0.95;
      }
    }
    const packed = buildHairMask({
      width,
      height,
      category,
      hairConf,
      faceSkinConf: new Float32Array(width * height),
      points: null,
      rgb,
    });
    expect(pixelIsHair(rgb, width, height, 8 * width + 70)).toBe(true);
    expect(packed[(12 * width + 16) * 4]).toBeGreaterThan(80);
    expect(packed[(8 * width + 70) * 4]).toBe(0);
  });

  it("keeps dim-hair texture variance", () => {
    const dye: [number, number, number] = [196 / 255, 92 / 255, 38 / 255];
    const strands = [0.02, 0.07, 0.03, 0.11, 0.045, 0.09, 0.06, 0.13, 0.025, 0.08];
    const before = strands.map((luma) => luma);
    const after = strands.map((luma) => {
      const dyed = dyeHairColor([luma, luma * 0.85, luma * 0.7], dye);
      const strength = 0.5;
      const mixed = dyed.map((channel, index) => {
        const source = index === 0 ? luma : index === 1 ? luma * 0.85 : luma * 0.7;
        return source * (1 - strength) + channel * strength;
      });
      return 0.2126 * mixed[0]! + 0.7152 * mixed[1]! + 0.0722 * mixed[2]!;
    });
    const variance = (values: number[]) => {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    };
    expect(variance(after)).toBeGreaterThan(variance(before) * 0.45);
    expect(liftHairLuma(0.02, 1)).toBeGreaterThan(0.08);
    expect(liftHairLuma(0.02, 1)).toBeLessThan(0.2);
    expect(liftHairLuma(0.55, 0.04)).toBeCloseTo(0.55, 2);
    expect(liftHairLuma(0.5)).toBeCloseTo(0.5, 5);
    expect(liftHairLuma(0.35)).toBeCloseTo(0.35, 5);
  });
});
