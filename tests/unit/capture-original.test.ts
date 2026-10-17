import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ORIGINAL_JPEG_QUALITY, cameraVideoConstraints, capturePixelSize } from "@/lib/capture";

describe("full-resolution originals", () => {
  it("keeps the portrait crop at the sensor size", () => {
    expect(ORIGINAL_JPEG_QUALITY).toBe(0.92);
    expect(capturePixelSize(1920, 1080)).toEqual({ width: 810, height: 1080 });
    expect(capturePixelSize(1080, 1920)).toEqual({ width: 1080, height: 1440 });
    const wide = capturePixelSize(4032, 3024);
    expect(Math.max(wide.width, wide.height)).toBeGreaterThan(1024);
  });

  it("asks the camera for 1080p or whatever the sensor can give", () => {
    const video = cameraVideoConstraints("user");
    expect(video.facingMode).toBe("user");
    expect(video.width).toEqual({ ideal: 1920 });
    expect(video.height).toEqual({ ideal: 1080 });
    const source = readFileSync("src/lib/capture.ts", "utf8");
    expect(source).toContain("ideal: width");
    expect(source).not.toContain("1024 / Math.max");
  });
});
