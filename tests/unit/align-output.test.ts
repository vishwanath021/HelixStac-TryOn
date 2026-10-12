import { describe, expect, it } from "vitest";
import { editSizeForAspect } from "@/lib/ai/edit-request";
import {
  EYE_CORNER_INDEXES,
  MOUTH_CORNER_INDEXES,
  alignAnchorIndexes,
  coverFit,
  meanPointDistance,
  pixelPoints,
  similarityOrCover,
  warpRgba,
} from "@/lib/face/align-output";
import { applySimilarity, fitSimilarity, type Point } from "@/lib/face/similarity";

const SUNBURST_SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;

function rgba(width: number, height: number, fill: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = 255;
  }
  return data;
}

function paint(data: Uint8ClampedArray, width: number, x: number, y: number, fill: [number, number, number]) {
  const o = (y * width + x) * 4;
  data[o] = fill[0];
  data[o + 1] = fill[1];
  data[o + 2] = fill[2];
  data[o + 3] = 255;
}

function read(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const o = (y * width + x) * 4;
  return [data[o], data[o + 1], data[o + 2], data[o + 3]];
}

describe("output alignment", () => {
  it("recovers scale, rotation, and translation", () => {
    const sim = { a: 0.8, b: 0.35, tx: 14, ty: -9 };
    const src: Point[] = [
      { x: 20, y: 30 },
      { x: 70, y: 28 },
      { x: 48, y: 55 },
      { x: 36, y: 78 },
      { x: 64, y: 80 },
    ];
    const dst = src.map((point) => applySimilarity(sim, point));
    const fit = fitSimilarity(src, dst);
    expect(fit.a).toBeCloseTo(sim.a, 6);
    expect(fit.b).toBeCloseTo(sim.b, 6);
    expect(fit.tx).toBeCloseTo(sim.tx, 4);
    expect(fit.ty).toBeCloseTo(sim.ty, 4);
    for (const point of src) {
      const mapped = applySimilarity(fit, point);
      const target = applySimilarity(sim, point);
      expect(Math.hypot(mapped.x - target.x, mapped.y - target.y)).toBeLessThan(1e-6);
    }
  });

  it("uses eyes, nose, and mouth, and drops the mouth for a beard", () => {
    expect(alignAnchorIndexes(false)).toEqual([...EYE_CORNER_INDEXES, 1, ...MOUTH_CORNER_INDEXES]);
    expect(alignAnchorIndexes(true)).toEqual([...EYE_CORNER_INDEXES, 1]);
    const width = 200;
    const height = 280;
    const rows = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.4 }));
    for (const index of alignAnchorIndexes(false)) {
      rows[index] = { x: 0.2 + index / 1000, y: 0.3 + index / 2000 };
    }
    const face = pixelPoints(rows, width, height, alignAnchorIndexes(false));
    const beard = pixelPoints(rows, width, height, alignAnchorIndexes(true));
    expect(face).toHaveLength(7);
    expect(beard).toHaveLength(5);
    expect(face?.[0]).toEqual({ x: rows[33].x * width, y: rows[33].y * height });
    const moved = rows.map((point) => ({ ...point }));
    moved[61] = { x: 0.1, y: 0.9 };
    moved[291] = { x: 0.9, y: 0.9 };
    const beardAgain = pixelPoints(moved, width, height, alignAnchorIndexes(true));
    expect(beardAgain).toEqual(beard);
    const full = pixelPoints(rows, width, height, alignAnchorIndexes(false))!;
    const fullMoved = pixelPoints(moved, width, height, alignAnchorIndexes(false))!;
    const target = full.map((point) => ({ x: point.x * 0.9 + 4, y: point.y * 0.9 + 6 }));
    const targetMoved = fullMoved.map((point, index) => (index >= 5 ? { x: point.x + 30, y: point.y + 20 } : target[index]));
    const withMouth = fitSimilarity(fullMoved, targetMoved);
    const eyesNose = fitSimilarity(beardAgain!, target.slice(0, 5));
    expect(withMouth.tx).not.toBeCloseTo(eyesNose.tx, 1);
    expect(eyesNose.a).toBeCloseTo(0.9, 5);
  });

  it("cover-fits a different aspect from the centre", () => {
    const fit = coverFit(200, 300, 300, 400);
    expect(fit.scale).toBeCloseTo(1.5, 6);
    expect(fit.offsetX).toBeCloseTo(0, 6);
    expect(fit.offsetY).toBeCloseTo(-25, 6);
    const placed = similarityOrCover({
      generated: null,
      original: null,
      srcW: 200,
      srcH: 300,
      dstW: 300,
      dstH: 400,
    });
    expect(placed.mode).toBe("cover");
    const centre = applySimilarity(placed.sim, { x: 100, y: 150 });
    expect(centre.x).toBeCloseTo(150, 4);
    expect(centre.y).toBeCloseTo(200, 4);
    const degenerate = similarityOrCover({
      generated: [{ x: 1, y: 1 }, { x: 1, y: 1 }],
      original: [{ x: 4, y: 4 }, { x: 8, y: 9 }],
      srcW: 200,
      srcH: 300,
      dstW: 300,
      dstH: 400,
    });
    expect(degenerate.mode).toBe("cover");
  });

  it("warps a shifted pixel and fills the gap from the generated edge", () => {
    const width = 8;
    const height = 8;
    const src = rgba(width, height, [0, 180, 40]);
    paint(src, width, 0, 0, [20, 20, 220]);
    paint(src, width, 1, 1, [220, 30, 30]);
    const sim = { a: 1, b: 0, tx: 3, ty: 4 };
    const out = warpRgba(src, width, height, sim, width, height);
    expect(read(out, width, 4, 5)).toEqual([220, 30, 30, 255]);
    expect(read(out, width, 0, 0)).toEqual([20, 20, 220, 255]);
    expect(read(out, width, 6, 6)).toEqual([0, 180, 40, 255]);
    const eyes = [
      { x: 10, y: 20 },
      { x: 30, y: 20 },
    ];
    expect(meanPointDistance(eyes, [{ x: 12, y: 23 }, { x: 33, y: 21 }])).toBeCloseTo((Math.hypot(2, 3) + Math.hypot(3, 1)) / 2, 6);
  });

  it("picks the closest sunburst canvas", () => {
    expect(editSizeForAspect(768, 1024, SUNBURST_SIZES)).toBe("1024x1536");
    expect(editSizeForAspect(1024, 768, SUNBURST_SIZES)).toBe("1536x1024");
    expect(editSizeForAspect(900, 900, SUNBURST_SIZES)).toBe("1024x1024");
  });
});
