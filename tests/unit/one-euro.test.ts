import { describe, expect, it } from "vitest";
import { LandmarkOneEuro, OneEuroFilter } from "@/lib/face/one-euro";

describe("One Euro landmarks", () => {
  it("holds a still point and catches a fast move without the old half-blend lag", () => {
    const filter = new OneEuroFilter();
    let value = filter.filter(0, 0);
    for (let frame = 1; frame <= 8; frame += 1) value = filter.filter(0, frame * 33);
    expect(value).toBeCloseTo(0, 3);
    const jumped = filter.filter(10, 9 * 33);
    const lagged = 0 * 0.55 + 10 * 0.45;
    expect(jumped).toBeGreaterThan(lagged);
    expect(jumped).toBeLessThan(10);
  });

  it("filters every landmark axis", () => {
    const landmarks = new LandmarkOneEuro();
    const first = landmarks.filter([{ x: 0.2, y: 0.4 }], 0);
    expect(first).toEqual([{ x: 0.2, y: 0.4 }]);
    const next = landmarks.filter([{ x: 0.8, y: 0.9 }], 40);
    expect(next[0]!.x).toBeGreaterThan(0.2);
    expect(next[0]!.x).toBeLessThan(0.8);
    expect(next[0]!.y).toBeGreaterThan(0.4);
  });
});
