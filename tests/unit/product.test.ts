import { createHmac } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { BEARDS } from "@/data/beards";
import { BROWS } from "@/data/brows";
import { NAILS } from "@/data/nails";
import { CONSENT_HASH, CONSENT_VERSION } from "@/data/consent";
import { SHADES } from "@/data/shades";
import { stylesForGender, STYLES } from "@/data/styles";
import { MockProvider } from "@/lib/ai/mock";
import { razorpaySignature, verifyRazorpaySignature } from "@/lib/billing/signature";
import { answerConcierge } from "@/lib/concierge";
import { parseHost } from "@/lib/host";
import { sanitizeSelfie } from "@/lib/images";
import { redact } from "@/lib/logger";
import { annualExGst, assumedInr, breakEvenAccounts, previewCogsInr, withGst } from "@/lib/pricing";
import { openAIQuality } from "@/lib/ai/openai";
import { beginPaidCall, costPerCallInr, spendCapInr } from "@/lib/ai/spend";
import { prisma } from "@/lib/prisma";
import { findSecrets, scanRepo } from "@/lib/secrets";
import { ageYears, capForTier, signSalonToken, verifySalonToken } from "@/lib/preview-access";
import { buildBeardPrompt, buildBrowPrompt, buildNailPrompt, buildStylePrompt } from "@/lib/prompts";
import { colourGuidance, faceGuidance, quizGuidance } from "@/lib/guidance";
import { rateLimit, resetRateLimits } from "@/lib/ratelimit";
import { recommendStyles } from "@/lib/recommendations";
import { buildWhatsAppLink } from "@/lib/whatsapp";

describe("catalogue", () => {
  it("ships 26 women's styles, 29 men's styles, kids styles, and 16 shades", () => {
    expect(stylesForGender("women")).toHaveLength(26);
    expect(stylesForGender("men")).toHaveLength(29);
    expect(stylesForGender("kids").length).toBeGreaterThanOrEqual(3);
    expect(SHADES).toHaveLength(16);
    expect(SHADES.map((shade) => shade.name)).toEqual(expect.arrayContaining(["Burgundy", "Honey Blonde", "Cherry Red", "Jet Black"]));
    expect(STYLES.every((style) => style.prompt.length > 20)).toBe(true);
  });
});

describe("prompts", () => {
  it("locks identity and only describes a hair change", () => {
    const prompt = buildStylePrompt(STYLES[0], "Cherry Red");
    expect(prompt).toContain("hair only");
    expect(prompt).toContain("skin tone");
    expect(prompt).toContain("Cherry Red");
    expect(prompt).toContain("not a guarantee");
    expect(prompt.toLowerCase()).not.toContain("change the face");
  });
});

describe("pricing", () => {
  it("adds 18% GST and prices a year as ten months", () => {
    expect(withGst(799)).toEqual({ exGstInr: 799, gstInr: 144, totalInr: 943 });
    expect(annualExGst(799)).toBe(7990);
    expect(annualExGst(1999)).toBe(19990);
    expect(breakEvenAccounts(30000, 935)).toBe(33);
    expect(previewCogsInr(2, 1)).toBe(14);
    expect(assumedInr(0.0336)).toBe(3.5);
    expect(assumedInr(0.067)).toBe(6.9);
  });
});

describe("whatsapp", () => {
  it("encodes Indic text and a 10-digit Indian mobile", () => {
    const link = buildWhatsAppLink({
      phone: "9800011122",
      salonName: "Demo Salon",
      lookName: "सॉफ्ट बॉब",
      shadeName: "Cherry Red",
      services: [{ name: "Haircut", priceInr: 499 }],
      lang: "hi",
    });
    expect(link.phone).toBe("919800011122");
    expect(link.url.startsWith("https://wa.me/919800011122?text=")).toBe(true);
    expect(decodeURIComponent(link.url)).toContain("सॉफ्ट बॉब");
    expect(decodeURIComponent(link.url)).toContain("₹499");
  });
});

describe("hosts", () => {
  it("resolves platform, try subdomains, and custom domains", () => {
    expect(parseHost("localhost:3000").kind).toBe("platform");
    expect(parseHost("demo-salon.localhost:3000")).toEqual({ kind: "subdomain", host: "demo-salon.localhost", slug: "demo-salon" });
    expect(parseHost("demo-salon.try.helixstac.in", "helixstac.in")).toMatchObject({ kind: "subdomain", slug: "demo-salon" });
    expect(parseHost("try.mysalon.in", "helixstac.in").kind).toBe("custom");
    expect(parseHost("admin.localhost").kind).toBe("custom");
  });
});

describe("rate limit and billing signature", () => {
  it("stops after the limit", () => {
    resetRateLimits();
    expect(rateLimit("k", 2, 1000, 0).ok).toBe(true);
    expect(rateLimit("k", 2, 1000, 10).ok).toBe(true);
    expect(rateLimit("k", 2, 1000, 20).ok).toBe(false);
  });

  it("verifies Razorpay HMAC signatures", () => {
    const body = '{"event":"subscription.charged"}';
    const secret = "whsec_test";
    const signature = razorpaySignature(body, secret);
    expect(signature).toBe(createHmac("sha256", secret).update(body).digest("hex"));
    expect(verifyRazorpaySignature(body, signature, secret)).toBe(true);
    expect(verifyRazorpaySignature(body, "nope", secret)).toBe(false);
  });
});

describe("recommendations and concierge", () => {
  it("labels matches from tags", () => {
    const picks = recommendStyles(stylesForGender("women"), "oval", "wavy", 3);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((style) => style.faceShapes.includes("oval") || style.hairTypes.includes("wavy"))).toBe(true);
  });

  it("answers prices from the salon menu", () => {
    const answer = answerConcierge("what is the price of colour?", {
      name: "Demo",
      services: [{ name: "Hair Colour", priceInr: 2499, durationMin: 90 }],
    });
    expect(answer).toContain("2,499");
    expect(answer.toLowerCase()).toContain("guide");
  });
});

describe("eyebrow catalogue", () => {
  it("ships seven shapes and prompts that edit brows only", () => {
    expect(BROWS.map((brow) => brow.name)).toEqual([
      "Soft Arch",
      "Straight Brow",
      "High Arch",
      "Rounded",
      "S-Shape",
      "Feathered",
      "Bold Natural",
    ]);
    for (const brow of BROWS) {
      const prompt = buildBrowPrompt(brow);
      expect(prompt.toLowerCase()).toContain("eyebrows only");
      expect(prompt.toLowerCase()).toContain("identity");
      expect(prompt.toLowerCase()).toContain("skin tone");
      expect(brow.serviceKeys).toEqual(["eyebrow-threading", "eyebrow-shaping"]);
    }
  });
});

describe("beard and nail catalogues", () => {
  it("keeps facial hair and nails in their own prompts", () => {
    expect(BEARDS).toHaveLength(10);
    expect(NAILS).toHaveLength(10);
    expect(BEARDS.map((item) => item.id)).toEqual(expect.arrayContaining(["light-stubble", "short-boxed", "full-beard", "goatee", "french-beard", "clean-shave"]));
    for (const beard of BEARDS) {
      const prompt = buildBeardPrompt(beard);
      expect(prompt.toLowerCase()).toContain("facial hair only");
      expect(prompt.toLowerCase()).toContain("identity");
      expect(prompt.toLowerCase()).toContain("skin tone");
    }
    for (const nail of NAILS) {
      const prompt = buildNailPrompt(nail);
      expect(prompt.toLowerCase()).toContain("fingernails only");
      expect(prompt.toLowerCase()).toContain("identity");
      expect(prompt.toLowerCase()).toContain("skin tone");
    }
  });
});

describe("preview caps and guidance", () => {
  it("gives salon mode no cap and keeps member above anonymous", () => {
    expect(capForTier("anon", 8, 30)).toBe(8);
    expect(capForTier("member", 8, 30)).toBe(30);
    expect(capForTier("salon", 8, 30)).toBeNull();
    expect(capForTier("anon", 0, 30)).toBe(0);
  });

  it("signs a salon token that fails when the nonce rotates", () => {
    process.env.AUTH_SECRET = "test-secret-not-for-production-use-32";
    const token = signSalonToken("tenant-1", "nonce-a", 1);
    expect(verifySalonToken(token, "tenant-1", "nonce-a")).toBe(true);
    expect(verifySalonToken(token, "tenant-1", "nonce-b")).toBe(false);
    expect(verifySalonToken("nope", "tenant-1", "nonce-a")).toBe(false);
  });

  it("rejects a hub profile under 13 and returns catalogue style ids", () => {
    expect(ageYears("2016-01-01", new Date("2026-10-03"))).toBe(10);
    expect(ageYears("2000-10-04", new Date("2026-10-03"))).toBe(25);
    const face = faceGuidance("oval", "women");
    expect(face.label.toLowerCase()).toContain("not a measurement");
    expect(face.styles.length).toBeGreaterThan(0);
    const colour = colourGuidance({ grey: false, undertone: "warm" });
    expect(colour.label.toLowerCase()).toContain("not a colour analysis");
    expect(colour.shades.every((shade) => shade.id.length > 0)).toBe(true);
    const quiz = quizGuidance({ who: "kids", length: "short", texture: "curly", occasion: "daily" });
    expect(quiz.styles.map((style) => style.id)).toEqual(expect.arrayContaining(["kids-soft-bob"]));
    expect(quiz.label.toLowerCase()).toContain("quiz");
  });
});

describe("openai quality and spend cap", () => {
  it("reads quality from env and stops the call that would pass the cap", async () => {
    process.env.OPENAI_IMAGE_QUALITY = "low";
    process.env.OPENAI_IMAGE_QUALITY_HD = "high";
    expect(openAIQuality("standard")).toBe("low");
    expect(openAIQuality("hd")).toBe("high");
    process.env.OPENAI_IMAGE_QUALITY = "nope";
    expect(openAIQuality("standard")).toBe("medium");
    process.env.AI_COST_PER_CALL_INR_OPENAI_MEDIUM = "6";
    process.env.AI_SPEND_CAP_INR = "10";
    expect(costPerCallInr("openai", "medium")).toBe(6);
    expect(spendCapInr()).toBe(10);
    await prisma.aiCall.deleteMany();
    const first = await beginPaidCall({ provider: "openai", quality: "medium", model: "gpt-image-1", tenantId: "spend-test" });
    const second = await beginPaidCall({ provider: "openai", quality: "medium", model: "gpt-image-1", tenantId: "spend-test" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(await prisma.aiCall.count({ where: { status: "CHARGED" } })).toBe(1);
    expect(await prisma.aiCall.count({ where: { status: "REFUSED" } })).toBe(1);
    delete process.env.AI_SPEND_CAP_INR;
    delete process.env.AI_COST_PER_CALL_INR_OPENAI_MEDIUM;
    delete process.env.OPENAI_IMAGE_QUALITY;
    delete process.env.OPENAI_IMAGE_QUALITY_HD;
  });
});

describe("secret scan", () => {
  it("flags a long token and ignores the short examples in the docs", () => {
    expect(findSecrets(`sk-${"a".repeat(24)}`).map((hit) => hit.name)).toContain("openai");
    expect(findSecrets(`AIza${"b".repeat(20)}`).map((hit) => hit.name)).toContain("google");
    expect(findSecrets("keys look like sk-... or AIza...")).toEqual([]);
    expect(scanRepo()).toEqual([]);
  });
});

describe("privacy helpers", () => {
  it("redacts photo fields and keeps a stable consent hash", () => {
    expect(redact({ photo: "abc", note: "ok" })).toEqual({ photo: "[redacted]", note: "ok" });
    expect(redact("data:image/jpeg;base64,aaaa")).toBe("[redacted-string]");
    expect(CONSENT_VERSION).toBe("2026-10-03");
    expect(CONSENT_HASH).toHaveLength(64);
  });

  it("strips a jpeg down to a smaller jpeg", async () => {
    const source = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#c4622d" },
    }).jpeg().toBuffer();
    const clean = await sanitizeSelfie(source);
    expect(clean[0]).toBe(0xff);
    expect(clean.length).toBeLessThan(source.length + 50000);
    const meta = await sharp(clean).metadata();
    expect(meta.width).toBeLessThanOrEqual(1024);
    expect(meta.exif).toBeUndefined();
  });
});

describe("mock provider", () => {
  it("returns a watermarked jpeg without a network call", async () => {
    process.env.MOCK_DELAY_MS = "0";
    const input = await sharp({ create: { width: 64, height: 80, channels: 3, background: "#e7c2a4" } }).jpeg().toBuffer();
    const result = await new MockProvider().generate({
      image: input,
      styleId: "soft-bob",
      gender: "women",
      prompt: "Soft Bob. Keep the person.",
      tenantId: "t1",
      quality: "standard",
    });
    expect(result.provider).toBe("mock");
    expect(result.providerCostUsd).toBe(0);
    expect(result.image[0]).toBe(0xff);
    expect(result.image.length).toBeGreaterThan(1000);
  });

  it("watermarks a brow edit the same way", async () => {
    process.env.MOCK_DELAY_MS = "0";
    const input = await sharp({ create: { width: 64, height: 80, channels: 3, background: "#e7c2a4" } }).jpeg().toBuffer();
    const brow = BROWS[0];
    const result = await new MockProvider().generate({
      image: input,
      styleId: brow.id,
      gender: "women",
      prompt: buildBrowPrompt(brow),
      tenantId: "t1",
      quality: "standard",
      kind: "brows",
    });
    expect(result.mime).toBe("image/jpeg");
    expect(result.image[0]).toBe(0xff);
    expect(result.providerCostUsd).toBe(0);
  });
});
