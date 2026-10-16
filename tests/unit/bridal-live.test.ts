import { describe, expect, it } from "vitest";
import { bridalFinishById, bridalLipById, bridalLookById } from "@/data/bridal";
import { coverPoint, liveMakeupAllowed } from "@/lib/face/cover-point";
import { buildBridalPrompt } from "@/lib/prompts";

describe("live makeup budget", () => {
  it("skips the face model on a phone under 3 GB and keeps it on a mid-range phone", () => {
    expect(liveMakeupAllowed(2)).toBe(false);
    expect(liveMakeupAllowed(4)).toBe(true);
    expect(liveMakeupAllowed(undefined)).toBe(true);
  });

  it("places a centred landmark in the middle of a tall object-cover frame", () => {
    const point = coverPoint(0.5, 0.5, { videoWidth: 1000, videoHeight: 1000, clientWidth: 100, clientHeight: 200 }, 100, 200);
    expect(point.x).toBeCloseTo(50);
    expect(point.y).toBeCloseTo(100);
  });
});

describe("bridal prompt shades", () => {
  it("tells the model which live mirror choices to paint on the real portrait", () => {
    const look = bridalLookById("telugu-muhurtham");
    const finish = bridalFinishById("matte");
    const lip = bridalLipById("berry");
    expect(look && finish && lip).toBeTruthy();
    if (!look || !finish || !lip) return;
    const prompt = buildBridalPrompt(look, finish, lip, { kajal: true, lashes: false, blush: true, brow: false });
    expect(prompt).toContain("kajal on");
    expect(prompt).toContain("lashes off");
    expect(prompt).toContain("blush on");
    expect(prompt).toContain("brow tint off");
    expect(prompt).toContain("Berry");
    expect(prompt).toContain("full look, not a camera filter");
  });
});
