import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  backgroundEdgeDelta,
  buildProtectedZone,
  compositeHair,
  DRIFT_LIMITS,
  drawFaceCheck,
  FACE_LANDMARK_LIMIT,
  faceDrift,
  HAIR_FEATHER_PX,
  HALO_MAX_DELTA,
  unchangedWallDelta,
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

  it("does not flag the same face with new hair, and does flag a redrawn brow", () => {
    const originalLandmarks = facePoints();
    const zone = new Uint8Array(width * height);
    for (let y = 24; y < 60; y += 1) {
      for (let x = 20; x < 60; x += 1) zone[y * width + x] = 255;
    }
    const original = blank([120, 90, 70]);
    const newHair = blank([40, 40, 200]);
    for (let y = 0; y < 18; y += 1) {
      for (let x = 0; x < width; x += 1) paint(newHair, x, y, [20, 20, 20]);
    }
    for (let y = 24; y < 60; y += 1) {
      for (let x = 20; x < 60; x += 1) {
        const on = (x + y) % 2 === 0;
        paint(original, x, y, on ? [20, 20, 20] : [230, 230, 230]);
        paint(newHair, x, y, on ? [230, 210, 40] : [20, 20, 180]);
      }
    }
    const shifted = originalLandmarks.map((point) => ({ ...point }));
    shifted[EAR_LEFT] = { x: 74, y: 36 };
    shifted[EAR_RIGHT] = { x: 6, y: 36 };
    const kept = faceDrift({
      original,
      compared: newHair,
      originalLandmarks,
      comparedLandmarks: shifted,
      zone,
    });
    expect(kept.ssim).toBeLessThan(DRIFT_LIMITS.ssim);
    expect(kept.widthDelta).toBeGreaterThan(DRIFT_LIMITS.width);
    expect(kept.landmarkError).toBeLessThan(FACE_LANDMARK_LIMIT);
    expect(kept.flagged).toBe(false);

    const redrawnLandmarks = facePoints();
    for (const index of [...LEFT_BROW, ...RIGHT_BROW]) redrawnLandmarks[index] = { x: redrawnLandmarks[index].x, y: 8 };
    const drift = faceDrift({
      original,
      compared: newHair,
      originalLandmarks,
      comparedLandmarks: redrawnLandmarks,
      zone,
    });
    expect(drift.browDelta).toBeGreaterThan(DRIFT_LIMITS.brow);
    expect(drift.landmarkError).toBeGreaterThan(FACE_LANDMARK_LIMIT);
    expect(drift.flagged).toBe(true);

    const overlay = drawFaceCheck(original, originalLandmarks, redrawnLandmarks);
    expect(read(overlay, 28, 26)).toEqual([40, 220, 80]);
    expect(read(overlay, 28, 8)).toEqual([230, 40, 40]);
  });

  it("keeps a white generated fringe off the original wall", () => {
    const size = 64;
    const wall: [number, number, number] = [210, 200, 190];
    const dark: [number, number, number] = [30, 22, 16];
    const white: [number, number, number] = [250, 250, 248];
    const original = Buffer.alloc(size * size * 3);
    const aligned = Buffer.alloc(size * size * 3);
    const trueHair = new Uint8Array(size * size);
    const newHair = new Uint8Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const o = (y * size + x) * 3;
        const core = x >= 16 && x < 40 && y >= 8 && y < 32;
        const claimed = x >= 12 && x < 44 && y >= 4 && y < 36;
        const rgb = core ? dark : wall;
        original[o] = rgb[0];
        original[o + 1] = rgb[1];
        original[o + 2] = rgb[2];
        const generated = core ? dark : white;
        aligned[o] = generated[0];
        aligned[o + 1] = generated[1];
        aligned[o + 2] = generated[2];
        if (core) trueHair[y * size + x] = 255;
        if (claimed) newHair[y * size + x] = 255;
      }
    }
    const empty = new Uint8Array(size * size);
    const source = { data: original, width: size, height: size };
    const result = compositeHair({
      original: source,
      aligned: { data: aligned, width: size, height: size },
      oldHair: trueHair,
      newHair,
      garments: empty,
      skin: empty,
      protectedZone: empty,
    });
    expect(result.featherPx).toBe(HAIR_FEATHER_PX);
    const delta = backgroundEdgeDelta(source, result.image, trueHair);
    expect(delta).toBeLessThan(HALO_MAX_DELTA);
    expect(unchangedWallDelta(source, result.image, trueHair, newHair)).toBeLessThan(HALO_MAX_DELTA);
    const naive = Buffer.from(original);
    for (let i = 0; i < newHair.length; i += 1) {
      if (newHair[i] < 128) continue;
      naive[i * 3] = aligned[i * 3];
      naive[i * 3 + 1] = aligned[i * 3 + 1];
      naive[i * 3 + 2] = aligned[i * 3 + 2];
    }
    expect(backgroundEdgeDelta(source, { data: naive, width: size, height: size }, trueHair)).toBeGreaterThan(HALO_MAX_DELTA);
    const center = (20 * size + 28) * 3;
    expect([result.image.data[center], result.image.data[center + 1], result.image.data[center + 2]]).toEqual(dark);
    const fringe = (20 * size + 13) * 3;
    const fringeRgb = [result.image.data[fringe], result.image.data[fringe + 1], result.image.data[fringe + 2]];
    expect(Math.abs(fringeRgb[0] - wall[0]) + Math.abs(fringeRgb[1] - wall[1]) + Math.abs(fringeRgb[2] - wall[2])).toBeLessThan(HALO_MAX_DELTA * 3);
  });

  it("fills removed hair from the neighbouring wall, not the pale model background", () => {
    const size = 64;
    const wall: [number, number, number] = [210, 200, 190];
    const dark: [number, number, number] = [24, 18, 14];
    const white: [number, number, number] = [250, 250, 248];
    const original = Buffer.alloc(size * size * 3);
    const aligned = Buffer.alloc(size * size * 3);
    const oldHair = new Uint8Array(size * size);
    const newHair = new Uint8Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const o = (y * size + x) * 3;
        const oldOn = x >= 8 && x < 40 && y >= 16 && y < 40;
        const newOn = x >= 22 && x < 40 && y >= 16 && y < 40;
        const fringe = x >= 6 && x < 8 && y >= 16 && y < 40;
        const rgb = oldOn || fringe ? dark : wall;
        original[o] = rgb[0];
        original[o + 1] = rgb[1];
        original[o + 2] = rgb[2];
        const generated = newOn ? dark : white;
        aligned[o] = generated[0];
        aligned[o + 1] = generated[1];
        aligned[o + 2] = generated[2];
        if (oldOn) oldHair[y * size + x] = 255;
        if (newOn) newHair[y * size + x] = 255;
      }
    }
    const empty = new Uint8Array(size * size);
    const source = { data: original, width: size, height: size };
    const result = compositeHair({
      original: source,
      aligned: { data: aligned, width: size, height: size },
      oldHair,
      newHair,
      garments: empty,
      skin: empty,
      protectedZone: empty,
    });
    const removed = (28 * size + 12) * 3;
    const filled = [result.image.data[removed], result.image.data[removed + 1], result.image.data[removed + 2]];
    expect(Math.abs(filled[0] - wall[0]) + Math.abs(filled[1] - wall[1]) + Math.abs(filled[2] - wall[2])).toBeLessThan(HALO_MAX_DELTA * 3);
    expect(filled[0]).toBeLessThan(230);
    const outside = (28 * size + 2) * 3;
    expect([result.image.data[outside], result.image.data[outside + 1], result.image.data[outside + 2]]).toEqual(wall);
    const fringePx = (28 * size + 7) * 3;
    const fringeRgb = [result.image.data[fringePx], result.image.data[fringePx + 1], result.image.data[fringePx + 2]];
    expect(Math.abs(fringeRgb[0] - wall[0]) + Math.abs(fringeRgb[1] - wall[1]) + Math.abs(fringeRgb[2] - wall[2])).toBeLessThan(HALO_MAX_DELTA * 3);
    const center = (28 * size + 30) * 3;
    expect([result.image.data[center], result.image.data[center + 1], result.image.data[center + 2]]).toEqual(dark);
  });

  it("refuses a missing vision model", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vision-missing-"));
    expect(() => assertVisionFiles(dir)).toThrow(VisionAssetError);
    expect(() => assertVisionFiles(dir)).toThrow(/missing or unusable/);
  });
});
