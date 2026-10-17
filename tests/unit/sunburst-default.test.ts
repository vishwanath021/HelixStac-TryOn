import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { bridalFinishById, bridalLipById, bridalLookById } from "@/data/bridal";
import { DEFAULT_GUEST_ENGINE, guestEngineAfterFailure, guestEngineToRun, readGuestEngine } from "@/lib/ai/guest-hairstyle";
import { fitInsideCanvas, restoreFrame } from "@/lib/ai/frame";
import { matchSelfieOutput } from "@/lib/ai/output-size";
import { providerUsageLog } from "@/lib/ai/tiers";
import { GENERATION_EXPECTED_MS } from "@/lib/generation-stage";
import { logProviderCall } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { buildBridalPrompt } from "@/lib/prompts";

describe("sunburst default try-on", () => {
  it("uses 1024x1360 for a 3:4 selfie and crops every other shape back", async () => {
    expect(GENERATION_EXPECTED_MS).toBe(18_000);
    const portrait = matchSelfieOutput(768, 1024);
    expect(portrait).toMatchObject({ size: "1024x1360", exact: true });
    expect(matchSelfieOutput(1024, 768).size).toBe("1360x1024");
    expect(matchSelfieOutput(1080, 1920).size).toBe("1024x1824");
    expect(matchSelfieOutput(900, 900)).toMatchObject({ size: "1024x1024", exact: true });
    expect(matchSelfieOutput(1024, 1536)).toMatchObject({ size: "1024x1536", exact: true });
    const odd = matchSelfieOutput(500, 700);
    expect(odd.exact).toBe(false);
    const source = await sharp({ create: { width: 500, height: 700, channels: 3, background: "#886655" } }).png().toBuffer();
    const fitted = await fitInsideCanvas(source, odd.size);
    const back = await restoreFrame(fitted.png, fitted.transform);
    const meta = await sharp(back).metadata();
    expect((meta.width || 0) / (meta.height || 1)).toBeCloseTo(500 / 700, 2);
  });

  it("defaults every guest tool to sunburst and uses fal only after an unbilled OpenAI failure", async () => {
    expect(DEFAULT_GUEST_ENGINE).toBe("openai");
    await prisma.platformSetting.deleteMany({ where: { key: "guest_hairstyle_engine" } });
    expect((await readGuestEngine("")).engine).toBe("openai");
    expect(guestEngineToRun("openai", true, true)).toBe("openai");
    expect(guestEngineToRun("openai", false, true)).toBe("fal");
    expect(guestEngineToRun("openai", false, false)).toBeNull();
    expect(guestEngineToRun("fal", true, true)).toBe("fal");
    expect(guestEngineAfterFailure("openai", true, { outcome: "provider", billedAttempt: false })).toBe("fal");
    expect(guestEngineAfterFailure("openai", true, { outcome: "provider", billedAttempt: true })).toBeNull();
    expect(guestEngineAfterFailure("openai", true, { outcome: "uncertain" })).toBeNull();
    expect(guestEngineAfterFailure("openai", true, { outcome: "spend-cap" })).toBeNull();
    expect(guestEngineAfterFailure("openai", false, { outcome: "provider" })).toBeNull();
    expect(guestEngineAfterFailure("fal", true, { outcome: "provider" })).toBeNull();
  });

  it("keeps clothing and jewellery on a makeup-only look and copies clothing for a saree", () => {
    const look = bridalLookById("telugu-muhurtham");
    const finish = bridalFinishById("hd");
    const lip = bridalLipById("red");
    expect(look?.outfit).toBe(true);
    if (!look || !finish || !lip) return;
    const saree = buildBridalPrompt(look, finish, lip);
    expect(saree).toContain("Copy the clothing from image 2");
    expect(saree).toContain("outfit or saree");
    const makeup = buildBridalPrompt({ ...look, outfit: false, name: "Classic Red" }, finish, lip);
    expect(makeup).toContain("makeup-only");
    expect(makeup).toContain("Keep the customer's own clothing and jewellery");
    expect(makeup).not.toContain("Copy the clothing from image 2");
  });

  it("logs the real token cost from an OpenAI usage object", () => {
    const usage = { textTokens: 20, imageTokens: 80, outputTokens: 1500, inputTokens: 100, totalTokens: 1600 };
    const priced = providerUsageLog("gpt-image-2.5-sunburst", usage);
    expect(priced.known).toBe(true);
    expect(priced.pictureOut).toBe(1500);
    expect(priced.costUsd).toBeCloseTo((20 * 5 + 80 * 8 + 1500 * 30) / 1_000_000, 6);
    const lines: unknown[] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      lines.push(args);
    };
    try {
      logProviderCall({
        provider: "openai",
        model: "gpt-image-2.5-sunburst",
        salonId: "salon",
        status: "ok",
        latencyMs: 18_000,
        costUsd: priced.costUsd,
        textCount: priced.textCount,
        pictureIn: priced.pictureIn,
        pictureOut: priced.pictureOut,
      });
    } finally {
      console.info = original;
    }
    const text = JSON.stringify(lines);
    expect(text).toContain(String(priced.costUsd));
    expect(text).toContain("1500");
    expect(text).not.toContain("[redacted]");
  });
});
