import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProtectedZone,
  compositeHair,
  DRIFT_LIMITS,
  faceDrift,
} from "@/lib/face/hair-composite";
import {
  CHIN,
  EAR_LEFT,
  EAR_RIGHT,
  FACE_OVAL,
  JAW,
  LEFT_BROW,
  LEFT_EYE,
  LEFT_IRIS,
  LIPS,
  LOWER_LIP,
  MOUTH_LEFT,
  MOUTH_RIGHT,
  NOSE_BLOB,
  NOSE_BOTTOM,
  NOSE_TIP,
  RIGHT_BROW,
  RIGHT_EYE,
  RIGHT_IRIS,
  UPPER_LIP,
} from "@/lib/face/landmarks";
import type { RgbImage } from "@/lib/face/raster";
import { applySimilarity, fitSimilarity, invertSimilarity, roundTripError, type Point } from "@/lib/face/similarity";
import { assertVisionFiles, VisionAssetError } from "@/lib/face/vision-assets";

const width = 80;
const height = 80;

function blank(rgb: [number, number, number]): RgbImage {
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 3] = rgb[0];
    data[i * 3 + 1] = rgb[1];
    data[i * 3 + 2] = rgb[2];
  }
  return { data, width, height };
}

function paint(image: RgbImage, x: number, y: number, rgb: [number, number, number]) {
  const i = (y * width + x) * 3;
  image.data[i] = rgb[0];
  image.data[i + 1] = rgb[1];
  image.data[i + 2] = rgb[2];
}

function read(image: RgbImage, x: number, y: number) {
  const i = (y * width + x) * 3;
  return [image.data[i], image.data[i + 1], image.data[i + 2]];
}

function facePoints(): Point[] {
  const points = Array.from({ length: 478 }, () => ({ x: 40, y: 40 }));
  FACE_OVAL.forEach((index, order) => {
    const t = -Math.PI / 2 + (order / FACE_OVAL.length) * Math.PI * 2;
    points[index] = { x: 40 + Math.cos(t) * 22, y: 42 + Math.sin(t) * 26 };
  });
  for (const index of RIGHT_EYE) points[index] = { x: 28, y: 34 };
  for (const index of LEFT_EYE) points[index] = { x: 52, y: 34 };
  for (const index of RIGHT_IRIS) points[index] = { x: 28, y: 34 };
  for (const index of LEFT_IRIS) points[index] = { x: 52, y: 34 };
  for (const index of RIGHT_BROW) points[index] = { x: 28, y: 26 };
  for (const index of LEFT_BROW) points[index] = { x: 52, y: 26 };
  points[NOSE_TIP] = { x: 40, y: 46 };
  points[NOSE_BOTTOM] = { x: 40, y: 50 };
  points[98] = { x: 34, y: 50 };
  points[327] = { x: 46, y: 50 };
  for (const index of NOSE_BLOB) {
    if (points[index].x === 40 && points[index].y === 40) points[index] = { x: 40, y: 46 };
  }
  for (const index of LIPS) points[index] = { x: 40, y: 56 };
  points[UPPER_LIP] = { x: 40, y: 54 };
  points[LOWER_LIP] = { x: 40, y: 58 };
  points[MOUTH_LEFT] = { x: 32, y: 56 };
  points[MOUTH_RIGHT] = { x: 48, y: 56 };
  points[CHIN] = { x: 40, y: 68 };
  points[EAR_RIGHT] = { x: 16, y: 36 };
  points[EAR_LEFT] = { x: 64, y: 36 };
  JAW.forEach((index, order) => {
    const t = Math.PI * (0.15 + (0.7 * order) / (JAW.length - 1));
    points[index] = { x: 40 + Math.cos(t) * 18, y: 58 + Math.sin(t) * 12 };
  });
  points[CHIN] = { x: 40, y: 70 };
  return points;
}

describe("hair-only composite", () => {
  it("keeps the protected face, beard, and clothes, and replaces hair", () => {
    const landmarks = facePoints();
    const oldHair = new Uint8Array(width * height);
    const garments = new Uint8Array(width * height);
    for (let y = 0; y < 12; y += 1) {
      for (let x = 0; x < width; x += 1) oldHair[y * width + x] = 255;
    }
    oldHair[70 * width + 40] = 255;
    for (let x = 0; x < width; x += 1) garments[76 * width + x] = 255;
    const zone = buildProtectedZone({ width, height, landmarks, oldHair });
    expect(zone[34 * width + 28]).toBe(255);
    expect(zone[34 * width + 52]).toBe(255);
    expect(zone[70 * width + 40]).toBe(255);

    const original = blank([0, 160, 0]);
    const aligned = blank([0, 160, 0]);
    paint(original, 28, 34, [0, 180, 20]);
    paint(aligned, 28, 34, [220, 0, 0]);
    paint(original, 40, 70, [0, 150, 30]);
    paint(aligned, 40, 70, [220, 10, 10]);
    paint(original, 10, 76, [0, 140, 40]);
    paint(aligned, 10, 76, [210, 20, 20]);
    paint(original, 8, 4, [0, 120, 10]);
    paint(aligned, 8, 4, [200, 30, 30]);
    const newHair = Uint8Array.from(oldHair);
    newHair[76 * width + 10] = 255;
    const result = compositeHair({
      original,
      aligned,
      oldHair,
      newHair,
      garments,
      skin: new Uint8Array(width * height),
      protectedZone: zone,
      featherPx: 0,
      dilatePx: 2,
    });
    expect(read(result.image, 28, 34)).toEqual([0, 180, 20]);
    expect(read(result.image, 40, 70)).toEqual([0, 150, 30]);
    expect(read(result.image, 10, 76)).toEqual([0, 140, 40]);
    expect(read(result.image, 8, 4)).toEqual([200, 30, 30]);
    expect(result.edit[34 * width + 28]).toBe(0);
    expect(result.edit[70 * width + 40]).toBe(0);
    expect(result.edit[76 * width + 10]).toBe(0);
    expect(result.edit[4 * width + 8]).toBe(255);
  });

  it("round-trips a similarity and a warped pixel within rounding", () => {
    const sim = { a: 1.4, b: -0.35, tx: 12, ty: -4 };
    const src = [
      { x: 10, y: 8 },
      { x: 40, y: 12 },
      { x: 18, y: 36 },
      { x: 44, y: 30 },
    ];
    const dst = src.map((point) => applySimilarity(sim, point));
    const fit = fitSimilarity(src, dst);
    expect(fit.a).toBeCloseTo(sim.a, 6);
    expect(fit.b).toBeCloseTo(sim.b, 6);
    expect(fit.tx).toBeCloseTo(sim.tx, 4);
    expect(fit.ty).toBeCloseTo(sim.ty, 4);
    expect(roundTripError(fit, src)).toBeLessThan(1e-6);
    const inverse = invertSimilarity(fit);
    const image = blank([0, 0, 0]);
    paint(image, 20, 16, [10, 20, 30]);
    const forward = applySimilarity(fit, { x: 20.5, y: 16.5 });
    const back = applySimilarity(inverse, forward);
    expect(Math.hypot(back.x - 20.5, back.y - 16.5)).toBeLessThan(1e-6);
    expect(read(image, 20, 16)).toEqual([10, 20, 30]);
  });

  it("flags a redrawn face and passes an unchanged face", () => {
    const originalLandmarks = facePoints();
    const zone = new Uint8Array(width * height);
    for (let y = 24; y < 60; y += 1) {
      for (let x = 20; x < 60; x += 1) zone[y * width + x] = 255;
    }
    const original = blank([120, 90, 70]);
    const same = faceDrift({
      original,
      compared: original,
      originalLandmarks,
      comparedLandmarks: originalLandmarks,
      zone,
    });
    expect(same.flagged).toBe(false);
    expect(same.ssim).toBeGreaterThan(0.99);

    const redrawnLandmarks = facePoints();
    for (const index of [...LEFT_BROW, ...RIGHT_BROW]) redrawnLandmarks[index] = { x: redrawnLandmarks[index].x, y: 8 };
    const redrawn = blank([40, 40, 200]);
    for (let y = 24; y < 60; y += 1) {
      for (let x = 20; x < 60; x += 1) {
        const on = (x + y) % 2 === 0;
        paint(original, x, y, on ? [20, 20, 20] : [230, 230, 230]);
        paint(redrawn, x, y, on ? [230, 210, 40] : [20, 20, 180]);
      }
    }
    const drift = faceDrift({
      original,
      compared: redrawn,
      originalLandmarks,
      comparedLandmarks: redrawnLandmarks,
      zone,
    });
    expect(drift.browDelta).toBeGreaterThan(DRIFT_LIMITS.brow);
    expect(drift.ssim).toBeLessThan(DRIFT_LIMITS.ssim);
    expect(drift.flagged).toBe(true);
  });

  it("refuses a missing vision model", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vision-missing-"));
    expect(() => assertVisionFiles(dir)).toThrow(VisionAssetError);
    expect(() => assertVisionFiles(dir)).toThrow(/missing or unusable/);
  });
});
