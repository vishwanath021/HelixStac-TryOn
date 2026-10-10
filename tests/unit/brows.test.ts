import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  BROWS_HIDDEN,
  FACE_TOO_TILTED,
  FACE_TOO_TURNED,
  analyzeRegion,
  browSignalsFromLandmarks,
  judgeBrowPlacement,
  type BrowLandmarks,
} from "@/lib/face/region";
import { HAIR, SKIN, blank, drawFrontal, drawProfile, drawTilted, fillEllipse } from "@/lib/face/synthetic";

const FRAME = { width: 768, height: 1024 };

function level(over: Partial<BrowLandmarks> = {}): BrowLandmarks {
  return {
    leftBrow: { x: 280, y: 340 },
    rightBrow: { x: 490, y: 346 },
    leftEye: { x: 310, y: 390 },
    rightEye: { x: 460, y: 394 },
    nose: { x: 385, y: 470 },
    chin: { x: 385, y: 620 },
    hairCover: 0.18,
    ...over,
  };
}

describe("brow placement", () => {
  it("accepts a level face, glasses-level hair, a slight roll, and a partial fringe", () => {
    expect(judgeBrowPlacement(browSignalsFromLandmarks(level(), FRAME)).ok).toBe(true);
    expect(judgeBrowPlacement(browSignalsFromLandmarks(level({ hairCover: 0.4 }), FRAME)).ok).toBe(true);
    const slight = judgeBrowPlacement(
      browSignalsFromLandmarks(
        level({
          leftBrow: { x: 282, y: 321 },
          rightBrow: { x: 488, y: 365 },
          nose: { x: 356, y: 480 },
          chin: { x: 340, y: 560 },
        }),
        FRAME,
      ),
    );
    expect(slight.ok).toBe(true);
  });

  it("rejects a steep roll, a turned face, and brows covered by hair", () => {
    const steep = judgeBrowPlacement(browSignalsFromLandmarks(level({ rightBrow: { x: 470, y: 460 } }), FRAME));
    expect(steep.ok).toBe(false);
    if (!steep.ok) {
      expect(steep.reason).toBe("tilt");
      expect(steep.message).toBe(FACE_TOO_TILTED);
    }
    const profile = judgeBrowPlacement(
      browSignalsFromLandmarks(level({ leftBrow: { x: 370, y: 340 }, nose: { x: 378, y: 470 } }), FRAME),
    );
    expect(profile.ok).toBe(false);
    if (!profile.ok) {
      expect(profile.reason).toBe("profile");
      expect(profile.message).toBe(FACE_TOO_TURNED);
    }
    const hidden = judgeBrowPlacement(browSignalsFromLandmarks(level({ hairCover: 0.9 }), FRAME));
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) {
      expect(hidden.reason).toBe("hair");
      expect(hidden.message).toBe(BROWS_HIDDEN);
    }
    const tiny = judgeBrowPlacement(browSignalsFromLandmarks(level({ chin: { x: 385, y: 380 } }), FRAME));
    expect(tiny.ok).toBe(false);
    if (!tiny.ok) expect(tiny.reason).toBe("small");
  });

  it("passes a front-facing selfie, glasses, bangs, and a slight tilt, and names the real failures", async () => {
    const frontal = drawFrontal(480, 640);
    expect(analyzeRegion(frontal.data, frontal.width, frontal.height, "brows").ok).toBe(true);

    const width = 480;
    const height = 640;
    const glasses = blank(width, height);
    fillEllipse(glasses, width, height, 240, 210, 100, 40, HAIR);
    fillEllipse(glasses, width, height, 240, 300, 80, 110, SKIN);
    for (let y = 272; y < 292; y += 1) {
      for (let x = 170; x < 310; x += 1) {
        const i = (y * width + x) * 3;
        glasses[i] = 20;
        glasses[i + 1] = 20;
        glasses[i + 2] = 20;
      }
    }
    expect(analyzeRegion(glasses, width, height, "brows").ok).toBe(true);

    const bangs = blank(width, height);
    fillEllipse(bangs, width, height, 240, 300, 80, 110, SKIN);
    fillEllipse(bangs, width, height, 240, 300 - 60, 88, 60, HAIR);
    expect(analyzeRegion(bangs, width, height, "brows").ok).toBe(true);

    const slight = blank(width, height);
    fillEllipse(slight, width, height, 240, 200, 100, 50, HAIR, 20);
    fillEllipse(slight, width, height, 240, 300, 80, 110, SKIN, 20);
    const rolled = analyzeRegion(slight, width, height, "brows");
    expect(rolled.ok).toBe(true);

    const tilted = drawTilted();
    const tooFar = analyzeRegion(tilted.data, tilted.width, tilted.height, "brows");
    expect(tooFar.ok).toBe(false);
    expect(tooFar.reason).toBe("tilt");
    expect(tooFar.message).toBe(FACE_TOO_TILTED);
    expect(analyzeRegion(tilted.data, tilted.width, tilted.height, "beard").reason).toBe("tilt");

    const profile = drawProfile();
    const turned = analyzeRegion(profile.data, profile.width, profile.height, "brows");
    expect(turned.ok).toBe(false);
    expect(turned.reason).toBe("profile");
    expect(turned.message).toBe(FACE_TOO_TURNED);

    const hidden = drawFrontal(480, 640);
    const cx = 240;
    const cy = Math.round(640 * 0.46);
    const rx = Math.round(480 * 0.16);
    const ry = Math.round(480 * 0.22);
    const faceY = cy - ry;
    for (let y = Math.round(faceY + ry * 2 * 0.18); y <= Math.round(faceY + ry * 2 * 0.4); y += 1) {
      for (let x = cx - Math.round(rx * 0.55); x <= cx + Math.round(rx * 0.55); x += 1) {
        const i = (y * width + x) * 3;
        hidden.data[i] = HAIR.r;
        hidden.data[i + 1] = HAIR.g;
        hidden.data[i + 2] = HAIR.b;
      }
    }
    const covered = analyzeRegion(hidden.data, hidden.width, hidden.height, "brows");
    expect(covered.ok).toBe(false);
    expect(covered.reason).toBe("hair");
    expect(covered.message).toMatch(/Brows hidden by hair/);

    const jpeg = readFileSync("public/samples/portrait.jpg");
    const decoded = await sharp(jpeg).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const selfie = analyzeRegion(decoded.data, decoded.info.width, decoded.info.height, "brows");
    expect(selfie.ok, selfie.message).toBe(true);
  });
});
