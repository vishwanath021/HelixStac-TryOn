import { describe, expect, it } from "vitest";
import { brandButtonColors, contrastRatio } from "@/lib/contrast";

describe("button contrast", () => {
  it("keeps WCAG AA text on salon brand colors and on the photo button", () => {
    const samples = ["#c4622d", "#241c16", "#ffffff", "#000000", "#ffff00", "#f3ece3", "#8a5a44"];
    for (let r = 0; r < 256; r += 51) {
      for (let g = 0; g < 256; g += 51) {
        for (let b = 0; b < 256; b += 51) {
          samples.push(`#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`);
        }
      }
    }
    for (const brand of samples) {
      const button = brandButtonColors(brand);
      expect(contrastRatio(button.background, button.color), brand).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio("#241c16", "#fffaf6")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#241c16", "#f3ece3")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#241c16", "#fffdfb")).toBeGreaterThanOrEqual(4.5);
  });
});