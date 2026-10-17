import { describe, expect, it } from "vitest";
import { BRIDAL_LIVE, CAMERA_LIVE, EYE_FEATHER_PX, EVERYDAY_LIVE, LIP_FEATHER_PX, adaptMakeupRgb, blushAlpha, eyelinerAt, kajalWidthPx, liveEffectsFor, livePreset, pointOnLine, type Px } from "@/lib/face/makeup-blend";

function almond() {
  const upper: Px[] = [];
  const lower: Px[] = [];
  for (let i = 0; i < 9; i += 1) {
    const t = i / 8;
    const x = 28 + t * 84;
    const bow = Math.sin(t * Math.PI) * 12;
    upper.push({ x, y: 48 - bow });
    lower.push({ x, y: 48 + bow * 0.65 });
  }
  return { upper, lower, center: { x: 70, y: 48 } as Px };
}

function outward(line: readonly Px[], s: number, center: Px, px: number): Px {
  const point = pointOnLine(line, s);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const mag = Math.hypot(dx, dy) || 1;
  return { x: point.x + (dx / mag) * px, y: point.y + (dy / mag) * px };
}

describe("blush falloff", () => {
  it("keeps neighbouring alpha steps under 0.02", () => {
    for (const face of [80, 140, 220, 360, 480]) {
      let maxStep = 0;
      const reach = Math.ceil(face * 0.6);
      for (let distance = 0; distance < reach; distance += 1) {
        const step = Math.abs(blushAlpha(distance + 1, face) - blushAlpha(distance, face));
        if (step > maxStep) maxStep = step;
      }
      expect(maxStep, `face ${face}`).toBeLessThan(0.02);
    }
  });

  it("peaks on the cheekbone and is gone well outside the face", () => {
    expect(blushAlpha(0, 220)).toBeCloseTo(0.18, 5);
    expect(blushAlpha(220, 220)).toBeLessThan(0.001);
  });
});

describe("eyeliner mask", () => {
  const { upper, lower, center } = almond();
  const width = 2.2;
  const wing = 8;
  const at = (p: Px) => eyelinerAt(p, upper, lower, width, wing);

  it("is open at the inner corner and empty inside the eye", () => {
    expect(at(center)).toBe(0);
    const inner = pointOnLine(upper, 1);
    expect(at({ x: inner.x + 6, y: inner.y })).toBeLessThan(0.08);
    const passable = (x: number, y: number) => at({ x, y }) < 0.15;
    const seen = new Set<string>();
    const queue: Px[] = [center];
    let escaped = false;
    while (queue.length) {
      const here = queue.pop()!;
      const key = `${Math.round(here.x)},${Math.round(here.y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (here.x > inner.x + 4) {
        escaped = true;
        break;
      }
      for (const next of [
        { x: here.x + 1, y: here.y },
        { x: here.x - 1, y: here.y },
        { x: here.x, y: here.y + 1 },
        { x: here.x, y: here.y - 1 },
      ]) {
        if (next.x < 0 || next.y < 0 || next.x > 140 || next.y > 100) continue;
        if (passable(next.x, next.y)) queue.push(next);
      }
    }
    expect(escaped).toBe(true);
  });

  it("has no gaps along the upper or lower lash line", () => {
    for (const line of [upper, lower]) {
      const samples: number[] = [];
      for (let i = 0; i <= 32; i += 1) {
        const s = 0.04 + (0.58 * i) / 32;
        samples.push(at(outward(line, s, center, 0.6)));
      }
      expect(Math.min(...samples)).toBeGreaterThan(0.45);
      const dips = samples.filter((value, index) => index > 0 && index < samples.length - 1 && value < 0.2 && samples[index - 1]! > 0.45 && samples[index + 1]! > 0.45);
      expect(dips).toEqual([]);
    }
  });
});

describe("kajal width", () => {
  it("stays between 1px and 2.5px for everyday and widens for bridal", () => {
    expect(kajalWidthPx(40)).toBe(1);
    expect(kajalWidthPx(100)).toBeCloseTo(2, 5);
    expect(kajalWidthPx(200)).toBe(2.5);
    expect(kajalWidthPx(200, true)).toBe(BRIDAL_LIVE.kajalMax);
  });
});

describe("bridal live intensity", () => {
  it("raises lip, blush, brow, and kajal while everyday stays subtle", () => {
    expect(livePreset(false)).toEqual(EVERYDAY_LIVE);
    expect(livePreset(undefined)).toEqual(EVERYDAY_LIVE);
    expect(BRIDAL_LIVE.lipMix).toBeCloseTo(0.7, 5);
    expect(BRIDAL_LIVE.blushPeak).toBeCloseTo(0.28, 5);
    expect(BRIDAL_LIVE.browMix).toBeGreaterThan(EVERYDAY_LIVE.browMix);
    expect(BRIDAL_LIVE.kajalMix).toBeGreaterThan(EVERYDAY_LIVE.kajalMix);
    expect(BRIDAL_LIVE.wing).toBeGreaterThan(EVERYDAY_LIVE.wing);
    expect(EVERYDAY_LIVE.blushPeak).toBeCloseTo(0.18, 5);
    expect(EVERYDAY_LIVE.lipMix).toBeCloseTo(0.55, 5);
  });

  it("leaves the eye opening empty even at the bridal stroke width", () => {
    const { upper, lower, center } = almond();
    expect(eyelinerAt(center, upper, lower, BRIDAL_LIVE.kajalMax, 28)).toBe(0);
  });
});

describe("webcam preview", () => {
  it("keeps lips and a soft kajal, and turns brows off", () => {
    expect(livePreset(true, true)).toEqual(CAMERA_LIVE);
    expect(CAMERA_LIVE.browMix).toBe(0);
    expect(CAMERA_LIVE.kajalMix).toBeLessThan(EVERYDAY_LIVE.kajalMix);
    expect(CAMERA_LIVE.blushPeak).toBeLessThan(EVERYDAY_LIVE.blushPeak);
    expect(CAMERA_LIVE.lipMix).toBeGreaterThan(0.5);
    expect(LIP_FEATHER_PX).toBeGreaterThanOrEqual(4);
    expect(EYE_FEATHER_PX).toBeGreaterThanOrEqual(3);
  });

  it("moves a lipstick toward the sampled skin lightness and keeps the hue", () => {
    const ink: [number, number, number] = [0.6, 0.08, 0.16];
    const warm = adaptMakeupRgb(ink, [0.45, 0.32, 0.26]);
    const deep = adaptMakeupRgb(ink, [0.25, 0.16, 0.12]);
    expect(warm[0]).toBeGreaterThan(deep[0]);
    expect(warm[0] / warm[1]).toBeCloseTo(ink[0] / ink[1], 1);
  });
});

describe("men’s live styling", () => {
  const on = { lip: "#9B2335", kajal: true, blush: true, brow: true, hair: "#C45C26" };

  it("drops makeup and keeps hair", () => {
    expect(liveEffectsFor("men", on)).toEqual({
      lip: null,
      kajal: false,
      blush: false,
      brow: false,
      hair: "#C45C26",
    });
  });

  it("leaves a bridal look alone", () => {
    expect(liveEffectsFor("women", on)).toEqual(on);
    expect(liveEffectsFor(undefined, on)).toEqual(on);
  });
});
