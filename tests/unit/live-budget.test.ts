import { describe, expect, it } from "vitest";
import { nextLiveBudget } from "@/lib/face/live-budget";

describe("live hair budget", () => {
  it("keeps full segmentation at 24fps and above", () => {
    expect(nextLiveBudget(24, 480, 6)).toEqual({ edge: 480, interval: 6, seg: true, degraded: false });
    expect(nextLiveBudget(40, 480, 6)).toEqual({ edge: 480, interval: 6, seg: true, degraded: false });
  });

  it("lowers resolution, then reuses the mask, and never turns hair colour off", () => {
    expect(nextLiveBudget(23, 480, 6)).toEqual({ edge: 360, interval: 6, seg: true, degraded: true });
    expect(nextLiveBudget(15, 360, 6)).toEqual({ edge: 360, interval: 12, seg: true, degraded: true });
    expect(nextLiveBudget(10, 360, 12)).toEqual({ edge: 360, interval: 12, seg: true, degraded: true });
    expect(nextLiveBudget(8, 360, 12).seg).toBe(true);
  });

  it("stays degraded after a slow stretch even when the next sample is fast", () => {
    expect(nextLiveBudget(30, 360, 12)).toEqual({ edge: 360, interval: 12, seg: true, degraded: true });
  });
});
