import { createHmac } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { BillingPanel } from "@/components/admin/BillingPanel";
import { describe, expect, it } from "vitest";
import { BEARDS } from "@/data/beards";
import { BROWS } from "@/data/brows";
import { NAILS } from "@/data/nails";
import { CONSENT_HASH, CONSENT_VERSION } from "@/data/consent";
import { SHADES } from "@/data/shades";
import { stylesForGender, STYLES } from "@/data/styles";
import { demoStyleComposite } from "@/lib/ai/composite";
import { MockProvider } from "@/lib/ai/mock";
import { styleReferenceFor } from "@/lib/ai/style-reference";
import { decryptSecret, encryptSecret, keyHint } from "@/lib/crypto/secret";
import { razorpaySignature, verifyRazorpaySignature } from "@/lib/billing/signature";
import { answerConcierge } from "@/lib/concierge";
import { parseHost } from "@/lib/host";
import { sanitizeSelfie } from "@/lib/images";
import { redact } from "@/lib/logger";
import { annualExGst, assumedInr, breakEvenAccounts, previewCogsInr, withGst } from "@/lib/pricing";
import { inputFidelityForModel, openAIQuality } from "@/lib/ai/openai";
import { beginPaidCall, costPerCallInr, kolkataMonthStart, spendCapInr, spendSummary } from "@/lib/ai/spend";
import { OWNER_PLAN_MESSAGE, ownerSelfServeBlocked } from "@/lib/billing/access";
import { PLANS, planById } from "@/data/plans";
import { prisma } from "@/lib/prisma";
import { findSecrets, scanRepo } from "@/lib/secrets";
import { ageYears, capForTier, signSalonToken, verifySalonToken } from "@/lib/preview-access";
import { buildBeardPrompt, buildBrowPrompt, buildNailPrompt, buildStylePrompt } from "@/lib/prompts";
import { colourGuidance, faceGuidance, quizGuidance } from "@/lib/guidance";
import { rateLimit, resetRateLimits } from "@/lib/ratelimit";
import { recommendStyles } from "@/lib/recommendations";
import { buildWhatsAppLink } from "@/lib/whatsapp";

describe("catalogue", () => {
  it("ships 30 women's styles, 29 men's styles, kids styles, and 16 shades", () => {
    const files = new Set(readdirSync("public/styles").filter((name) => name.endsWith(".jpg")).map((name) => name.replace(/\.jpg$/, "")));
    const ids = STYLES.map((style) => style.id);
    expect(ids.filter((id) => !files.has(id))).toEqual([]);
    expect([...files].filter((id) => !ids.includes(id))).toEqual([]);
    expect(stylesForGender("women")).toHaveLength(30);
    expect(stylesForGender("men")).toHaveLength(29);
    expect(stylesForGender("kids").length).toBeGreaterThanOrEqual(3);
    const kids = stylesForGender("kids");
    expect(kids.map((style) => style.name)).toEqual(expect.arrayContaining(["Short Crew", "Side Part Kids", "Textured Crop", "Spiky Short"]));
    for (const id of ["kids-short-crew", "kids-side-part", "kids-textured-crop", "kids-spiky-short", "kids-bowl"]) {
      expect(kids.find((style) => style.id === id)?.lengthCategory).toBe("short");
    }
    expect(kids.find((style) => style.id === "kids-bowl")?.prompt).toContain("not a helmet");
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
    expect(prompt).toContain("forehead skin");
    expect(prompt).toContain("natural hairline");
    expect(prompt).toContain("long hair becoming a bob");
    expect(prompt).toContain("Transparent mask pixels may change");
    expect(prompt).toContain("Do not zoom, crop, re-frame, or move the subject");
    expect(prompt.toLowerCase()).not.toContain("change the face");
  });

  it("asks supported OpenAI image models for high input fidelity and omits it on mini", () => {
    expect(inputFidelityForModel("gpt-image-1-mini")).toBe("");
    expect(inputFidelityForModel("gpt-image-1")).toBe("high");
    expect(inputFidelityForModel("gpt-image-1.5")).toBe("high");
    expect(inputFidelityForModel("gpt-image-2")).toBe("");
    expect(inputFidelityForModel("dall-e-2")).toBe("");
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
    expect(decodeURIComponent(link.url)).toContain("सॉफ्ट बॉब (Cherry Red)");
    expect(decodeURIComponent(link.url)).toContain("बुक करना");
    const withLook = buildWhatsAppLink({
      phone: "9800011122",
      salonName: "Demo Salon",
      lookName: "Soft Bob",
      services: [],
      lookUrl: "http://localhost:3000/api/v1/media?key=generations%2Fa%2Fb%2Fresult.jpg&exp=1&sig=abc",
    });
    expect(decodeURIComponent(withLook.url)).toContain("I'd like to book this look: Soft Bob.");
    expect(decodeURIComponent(withLook.url)).toContain("http://localhost:3000/api/v1/media");
    expect(buildWhatsAppLink({ phone: "", salonName: "Demo Salon", lookName: "Soft Bob", services: [] }).url).toBe("");
  });
});

describe("hosts", () => {
  it("resolves platform, try subdomains, and custom domains", () => {
    expect(parseHost("localhost:3000").kind).toBe("platform");
    expect(parseHost("demo-salon.localhost:3000")).toEqual({ kind: "subdomain", host: "demo-salon.localhost", slug: "demo-salon" });
    expect(parseHost("demo-salon.try.agenticbuildworks.com", "agenticbuildworks.com")).toMatchObject({ kind: "subdomain", slug: "demo-salon" });
    expect(parseHost("try.mysalon.in", "agenticbuildworks.com").kind).toBe("custom");
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
  it("ships a shape for each brow and prompts that edit brows only", () => {
    expect(BROWS.map((brow) => brow.name)).toEqual([
      "Soft Arch",
      "High Arch",
      "Straight",
      "Rounded",
      "S-Shape",
      "Feathered",
      "Bold Natural",
      "Angled",
      "Flat Thick",
      "Natural Groomed",
      "Thin Defined",
      "Tapered",
      "Clean-up",
    ]);
    for (const brow of BROWS) {
      const prompt = buildBrowPrompt(brow);
      expect(prompt).toContain("Image 1 is the customer selfie. Image 2 is a brow-shape diagram, not a face to copy.");
      expect(prompt).toContain("Change only the eyebrows.");
      expect(prompt).toContain("Keep the face, identity, hair, skin, background and framing identical.");
      expect(prompt.toLowerCase()).not.toContain("mask");
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
      expect(prompt).toContain("Image 1 is the customer selfie, image 2 is the reference.");
      expect(prompt).toContain("Change only the facial hair (beard, moustache, stubble) to match image 2.");
      expect(prompt).toContain("Keep the lips, mouth shape, teeth, nose, jaw, skin, hair, clothes and background the same.");
      expect(prompt).toContain("'Clean Shave' removes the facial hair.");
      expect(prompt).toContain("If the person is a woman or has no facial hair, still follow image 2 and keep the face the same.");
      expect(prompt.toLowerCase()).not.toContain("mask");
      if (beard.id === "short-boxed") {
        expect(prompt).toContain("clearly sharp boxed beard");
        expect(prompt).toContain("Hard squared cheek corners");
        expect(prompt).toContain("not a soft shadow");
      }
    }
    for (const nail of NAILS) {
      const prompt = buildNailPrompt(nail);
      expect(prompt).toContain("Image 1 is the customer selfie, image 2 is the reference.");
      expect(prompt).toContain("Change only the polish or art on the visible fingernails to match image 2.");
      expect(prompt).toContain("Keep the fingers, nail length, nail shape, skin, jewellery, clothes and background the same.");
      expect(prompt.toLowerCase()).not.toContain("mask");
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

  it("resets both spend caps on the first of the month in Asia/Kolkata", async () => {
    expect(kolkataMonthStart(new Date("2026-09-30T18:29:00.000Z")).toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(kolkataMonthStart(new Date("2026-09-30T18:30:00.000Z")).toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(kolkataMonthStart(new Date("2026-10-31T18:30:00.000Z")).toISOString()).toBe("2026-10-31T18:30:00.000Z");
    process.env.AI_SPEND_CAP_INR = "10";
    process.env.AI_SALON_SPEND_CAP_INR = "10";
    process.env.AI_COST_PER_CALL_INR_OPENAI_MEDIUM = "6";
    await prisma.aiCall.deleteMany();
    await prisma.aiCall.create({
      data: {
        provider: "openai",
        quality: "medium",
        model: "gpt-image-1",
        estimatePaise: 1000,
        costInrPaise: 1000,
        tenantId: "month-salon",
        status: "CHARGED",
        charged: true,
        costSource: "estimate",
        createdAt: new Date("2020-01-15T00:00:00.000Z"),
      },
    });
    const summary = await spendSummary();
    expect(summary.spentInr).toBe(0);
    const allowed = await beginPaidCall({ provider: "openai", quality: "medium", model: "gpt-image-1", tenantId: "month-salon", estimateInr: 6 });
    expect(allowed.ok).toBe(true);
    const blocked = await beginPaidCall({ provider: "openai", quality: "medium", model: "gpt-image-1", tenantId: "month-salon", estimateInr: 6 });
    expect(blocked.ok).toBe(false);
    expect(await prisma.aiCall.count({ where: { tenantId: "month-salon", status: "CHARGED", createdAt: { gte: kolkataMonthStart() } } })).toBe(1);
    delete process.env.AI_SPEND_CAP_INR;
    delete process.env.AI_SALON_SPEND_CAP_INR;
    delete process.env.AI_COST_PER_CALL_INR_OPENAI_MEDIUM;
  });
});

describe("plans and production mock billing", () => {
  it("prices Lite, Starter, and Pro ex-GST and adds 18% GST", () => {
    expect(PLANS.LITE).toMatchObject({ name: "Lite", monthlyExGst: 2999, credits: 300 });
    expect(PLANS.STARTER).toMatchObject({ name: "Starter", monthlyExGst: 5999, credits: 900 });
    expect(PLANS.PRO).toMatchObject({ name: "Pro", monthlyExGst: 10999, credits: 1800 });
    expect(withGst(2999)).toEqual({ exGstInr: 2999, gstInr: 540, totalInr: 3539 });
    expect(withGst(5999)).toEqual({ exGstInr: 5999, gstInr: 1080, totalInr: 7079 });
    expect(withGst(10999)).toEqual({ exGstInr: 10999, gstInr: 1980, totalInr: 12979 });
    expect(planById("CHAIN").id).toBe("PRO");
    expect(ownerSelfServeBlocked({ NODE_ENV: "production", BILLING_PROVIDER: "mock" } as NodeJS.ProcessEnv)).toBe(true);
    expect(ownerSelfServeBlocked({ NODE_ENV: "development", BILLING_PROVIDER: "mock" } as NodeJS.ProcessEnv)).toBe(false);
    expect(ownerSelfServeBlocked({ NODE_ENV: "production", BILLING_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "rk", RAZORPAY_KEY_SECRET: "rs" } as NodeJS.ProcessEnv)).toBe(false);
    expect(OWNER_PLAN_MESSAGE).toBe("Contact Lookuvi to activate your plan");
    expect(readFileSync("src/app/api/v1/admin/billing/route.ts", "utf8")).toContain("ownerSelfServeBlocked");
    const assign = readFileSync("src/app/api/v1/super/tenants/[id]/route.ts", "utf8");
    expect(assign).toContain('action: "PLAN_ASSIGN"');
    expect(assign).toContain('action: "CREDIT_ADJUST"');
    expect(readFileSync("docker-entrypoint.sh", "utf8")).toContain("npx prisma migrate deploy");
    expect(readFileSync("docker-compose.prod.yml", "utf8")).toContain("prisma migrate deploy");
    expect(readFileSync("Dockerfile", "utf8")).toContain('CMD ["./docker-entrypoint.sh"]');
    expect(readFileSync("DEPLOY.md", "utf8")).toContain("ubuntu-24-04-x64");
    const locked = renderToStaticMarkup(createElement(BillingPanel, { plan: "STARTER", status: "TRIAL", credits: 1, provider: "mock", locked: true }));
    expect(locked).toContain("Contact Lookuvi to activate your plan");
    expect(locked).not.toContain(">Choose<");
    const open = renderToStaticMarkup(createElement(BillingPanel, { plan: "STARTER", status: "TRIAL", credits: 1, provider: "mock" }));
    expect(open).toContain(">Choose<");
    expect(open).toContain("Lite");
    expect(open).toContain("Starter");
    expect(open).toContain("Pro");
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
    expect(redact({ photo: "abc", note: "ok", apiKey: "sk-abcdefghij" })).toEqual({ photo: "[redacted]", note: "ok", apiKey: "[redacted]" });
    expect(redact("data:image/jpeg;base64,aaaa")).toBe("[redacted-string]");
    expect(redact("sk-abcdefghij")).toBe("[redacted-string]");
    expect(CONSENT_VERSION).toBe("2026-10-15");
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

describe("style portraits and demo composite", () => {
  it("does not attach a style thumbnail unless the provider flag is on", () => {
    delete process.env.OPENAI_SEND_STYLE_REFERENCE;
    delete process.env.GEMINI_SEND_STYLE_REFERENCE;
    expect(styleReferenceFor({ styleId: "soft-bob", kind: "style" }, "openai")).toBeNull();
    expect(styleReferenceFor({ styleId: "soft-bob" }, "gemini")).toBeNull();
    process.env.OPENAI_SEND_STYLE_REFERENCE = "true";
    expect(styleReferenceFor({ styleId: "soft-bob", kind: "style" }, "openai")?.[0]).toBe(0xff);
    expect(styleReferenceFor({ styleId: "soft-bob", kind: "brows" }, "openai")).toBeNull();
    delete process.env.OPENAI_SEND_STYLE_REFERENCE;
  });

  it("keeps the guest photo and a neutral card when the portrait file is missing", async () => {
    expect(existsSync("public/styles/soft-bob.jpg")).toBe(true);
    const input = await sharp({ create: { width: 240, height: 320, channels: 3, background: "#2244ee" } }).jpeg().toBuffer();
    const image = await demoStyleComposite(input, "missing-style-id", "Missing");
    const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
    const x = Math.floor(info.width * 0.25);
    const y = Math.floor(info.height * 0.45);
    const i = (y * info.width + x) * info.channels;
    expect(data[i + 2]).toBeGreaterThan(data[i] + 40);
  });

  it("stores an AI key as ciphertext and a four-character hint", () => {
    const cipher = encryptSecret("unit-test-key-value");
    expect(cipher).not.toContain("unit-test-key-value");
    expect(decryptSecret(cipher)).toBe("unit-test-key-value");
    expect(keyHint("unit-test-key-value")).toBe("••••alue");
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
