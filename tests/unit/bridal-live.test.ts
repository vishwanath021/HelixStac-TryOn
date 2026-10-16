import { describe, expect, it } from "vitest";
import { BRIDAL_HAIR, BRIDAL_LOOKS, BRIDAL_MAKEUP, MEHENDI_CARDS, bridalFinishById, bridalHairById, bridalLipById, bridalLookById, bridalMakeupById, bridalStylesFor, cardsForStyle, defaultBridalStyle, looksForEvent } from "@/data/bridal";
import { readBridalGenerateFields } from "@/lib/bridal-request";
import { coverPoint, liveMakeupAllowed } from "@/lib/face/cover-point";
import { buildFalEditBody } from "@/lib/ai/fal-models";
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
    expect(prompt).not.toContain("Hairstyle to add");
    expect(prompt).toContain("exact face shape");
    expect(prompt).toContain("skin texture");
    expect(prompt).toContain("Do not slim, lift, smooth, or beautify");
    expect(prompt).toContain("sindoor");
    expect(prompt).toContain("nose pin");
    expect(prompt).toContain("Do not change the hair");
    expect(prompt).toContain("Tied hair stays tied");
    expect(prompt).toContain("Waves stay waves");
    expect(prompt).not.toMatch(/sleek low bun|open waves|textured side bun/i);
  });

  it("adds a chosen hairstyle and makeup note without trusting a raw id", () => {
    const look = bridalLookById("gadwal-telangana");
    const makeup = bridalMakeupById("makeup-classic-red");
    const hair = bridalHairById("hair-sleek-low-bun");
    expect(looksForEvent("wedding")[1]?.name).toBe("Telangana Gadwal Bride");
    expect(look && makeup && hair).toBeTruthy();
    if (!look || !makeup || !hair) return;
    const prompt = buildBridalPrompt(look, bridalFinishById(makeup.finishId), bridalLipById(makeup.lipId), {
      makeup: makeup.prompt,
      hair: hair.prompt,
    });
    expect(prompt).toContain("sleek low bun");
    expect(prompt).toContain("matha patti");
    expect(prompt).toContain("Change the hair only because a hairstyle was chosen");
    expect(prompt).toContain("exact face shape");
    expect(prompt).toContain("sindoor");
    expect(prompt).not.toMatch(/jasmine|marigold|poola|rose braid/i);
    expect(prompt).toContain("classic bridal red lip");
    expect(prompt).toContain("Lip colour: Red");
    expect(bridalHairById("not-a-style")).toBeNull();
    expect(bridalMakeupById("not-a-card")).toBeNull();
    expect(BRIDAL_HAIR.map((item) => item.name)).toEqual(["Sleek low bun", "Textured side bun", "Volume updo with matha patti"]);
    expect(BRIDAL_HAIR.every((item) => item.image === false)).toBe(true);
    expect([...BRIDAL_LOOKS, ...BRIDAL_MAKEUP, ...MEHENDI_CARDS].every((item) => item.image)).toBe(true);
  });

  it("keeps the supplied photos in Temple and hides an empty Trending chip", () => {
    for (const item of [...BRIDAL_LOOKS, ...BRIDAL_MAKEUP, ...BRIDAL_HAIR, ...MEHENDI_CARDS]) {
      expect(item.style).toBe("temple");
    }
    expect(bridalStylesFor(BRIDAL_LOOKS).map((style) => style.label)).toEqual(["Temple & Traditional"]);
    expect(defaultBridalStyle(BRIDAL_MAKEUP)).toBe("temple");
    expect(cardsForStyle(BRIDAL_LOOKS, "trending").map((look) => look.id)).toEqual(BRIDAL_LOOKS.map((look) => look.id));
    expect(cardsForStyle(BRIDAL_HAIR, "temple")).toHaveLength(3);
  });

  it("does not send edit strength or guidance, because flux-3 has neither", () => {
    const body = buildFalEditBody("blackforestlabs/flux-3/edit-image", {
      prompt: "keep the exact face",
      selfieUrl: "https://example.test/selfie.jpg",
      referenceUrl: "https://example.test/look.jpg",
      size: "1024x1536",
      width: 768,
      height: 1024,
    });
    expect(body).toBeTruthy();
    expect(body && "strength" in body).toBe(false);
    expect(body && "guidance" in body).toBe(false);
    expect(body && "guidance_scale" in body).toBe(false);
    expect(Object.keys(body ?? {}).sort()).toEqual(["aspect_ratio", "image_urls", "prompt"]);
  });

  it("drops an oversized hair id instead of copying it into the prompt", () => {
    const form = new FormData();
    form.set("hair", "x".repeat(200));
    form.set("makeup", "makeup-classic-red");
    form.set("kajal", "yes");
    const fields = readBridalGenerateFields(form);
    expect(fields.hair).toBeUndefined();
    expect(fields.makeup).toBe("makeup-classic-red");
    expect(fields.kajal).toBeUndefined();
  });
});
