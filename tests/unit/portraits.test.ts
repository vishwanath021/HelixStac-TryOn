import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FACE_TOO_TURNED, JAW_NOT_VISIBLE, analyzeRegion } from "@/lib/face/region";
import type { FaceLandmark } from "@/lib/face/pose";

const dir = path.join(process.cwd(), "tests/fixtures/portraits");

const FRONTAL = ["bindi-smile", "curly-freckles", "glasses-beard", "glasses-outdoor", "malayali-beard", "phone-smile", "woman-pink"];

async function place(name: string, tool: "brows" | "beard") {
  const jpeg = readFileSync(path.join(dir, `${name}.jpg`));
  const landmarks = JSON.parse(readFileSync(path.join(dir, `${name}.json`), "utf8")) as FaceLandmark[];
  const decoded = await sharp(jpeg).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return analyzeRegion(decoded.data, decoded.info.width, decoded.info.height, tool, { landmarks });
}

describe("realistic portrait fixtures", () => {
  it("has a landmark file for every portrait", () => {
    const photos = readdirSync(dir).filter((name) => name.endsWith(".jpg"));
    expect(photos.length).toBeGreaterThanOrEqual(8);
    for (const photo of photos) {
      const marks = JSON.parse(readFileSync(path.join(dir, photo.replace(/\.jpg$/, ".json")), "utf8")) as FaceLandmark[];
      expect(marks).toHaveLength(478);
    }
  });

  it("accepts frontal photos for brows and beard, including a bindi, glasses, a beard, and a hand beside the face", async () => {
    for (const name of FRONTAL) {
      const brows = await place(name, "brows");
      const beard = await place(name, "beard");
      expect(brows.ok, `${name} brows ${brows.message} yaw ${brows.debug?.yaw} hair ${brows.debug?.hair} zone ${brows.debug?.zone} area ${brows.debug?.maskArea}`).toBe(true);
      expect(beard.ok, `${name} beard ${beard.message} yaw ${beard.debug?.yaw}`).toBe(true);
      expect(brows.debug?.source).toBe("landmarks");
      expect(brows.debug?.failed).toBeNull();
      expect(beard.debug?.failed).toBeNull();
      expect(brows.debug?.hair ?? 1).toBeLessThanOrEqual(0.62);
      expect(brows.debug?.zone ?? 0).toBeGreaterThanOrEqual(0.06);
      expect(brows.debug?.zone ?? 1).toBeLessThanOrEqual(0.55);
      expect(brows.debug?.maskArea ?? 1).toBeLessThan(0.14);
      expect(brows.debug?.maskArea ?? 0).toBeGreaterThanOrEqual(0.0004);
    }
  });

  it("accepts brows on a tight crop and rejects the beard because the chin is out of frame", async () => {
    const brows = await place("face-portrait", "brows");
    const beard = await place("face-portrait", "beard");
    expect(brows.ok, brows.message).toBe(true);
    expect(beard.ok).toBe(false);
    expect(beard.message).toBe(JAW_NOT_VISIBLE);
    expect(beard.debug?.failed).toBe("jaw");
  });

  it("rejects a clearly turned face for brows and beard", async () => {
    const brows = await place("turned-beanie", "brows");
    const beard = await place("turned-beanie", "beard");
    expect(brows.ok).toBe(false);
    expect(brows.message).toBe(FACE_TOO_TURNED);
    expect(brows.debug?.failed).toBe("yaw");
    expect(Math.abs(brows.debug?.yaw ?? 0)).toBeGreaterThan(25);
    expect(beard.ok).toBe(false);
    expect(beard.message).toBe(JAW_NOT_VISIBLE);
    expect(beard.debug?.failed).toBe("jaw");
  });
});
