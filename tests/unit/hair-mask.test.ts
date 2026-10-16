import { describe, expect, it } from "vitest";
import { FACE_OVAL } from "@/lib/face/landmarks";
import { buildHairMask, pixelIsHair } from "@/lib/face/hair-mask";

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
  it("keeps confident hair and rejects skin, the face oval, and scores under 0.6", () => {
    const width = 48;
    const height = 48;
    const field = blank(width, height);
    paint(field, width, 1, 1, 16, 16, 0.92, 1);
    paint(field, width, 1, 30, 16, 46, 0.55, 1);
    paint(field, width, 20, 20, 30, 30, 0.98, 1);
    paint(field, width, 32, 2, 46, 16, 0.95, 3, 0.8);
    const points = Array.from({ length: 478 }, () => ({ x: 0.05, y: 0.05 }));
    FACE_OVAL.forEach((index, step) => {
      const angle = (step / FACE_OVAL.length) * Math.PI * 2;
      points[index] = { x: 0.5 + Math.cos(angle) * 0.22, y: 0.5 + Math.sin(angle) * 0.22 };
    });
    const packed = buildHairMask({ width, height, ...field, points });
    const alpha = (x: number, y: number) => packed[(y * width + x) * 4] ?? 0;
    expect(alpha(8, 8)).toBeGreaterThan(180);
    expect(alpha(4, 38)).toBe(0);
    expect(alpha(25, 25)).toBe(0);
    expect(alpha(38, 8)).toBe(0);
    expect(packed[(8 * width + 8) * 4 + 1]).toBe(0);
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
    expect(pixelIsHair(rgb, width, height, scalp)).toBe(false);
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
      points: null,
      rgb,
    });
    expect(packed[scalp * 4]).toBe(0);
    expect(packed[hair * 4]).toBeGreaterThan(180);
  });
});
