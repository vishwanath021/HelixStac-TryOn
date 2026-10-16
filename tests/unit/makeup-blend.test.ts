import { describe, expect, it } from "vitest";
import { blushAlpha, kajalWidthPx, liveEffectsFor } from "@/lib/face/makeup-blend";

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

describe("kajal width", () => {
  it("stays between 1px and 2.5px", () => {
    expect(kajalWidthPx(40)).toBe(1);
    expect(kajalWidthPx(100)).toBeCloseTo(2, 5);
    expect(kajalWidthPx(200)).toBe(2.5);
  });
});

describe("men’s live styling", () => {
  const on = { lip: "#9B2335", kajal: true, lashes: true, blush: true, brow: true, hair: "#C45C26" };

  it("drops makeup and keeps hair", () => {
    expect(liveEffectsFor("men", on)).toEqual({
      lip: null,
      kajal: false,
      lashes: false,
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
