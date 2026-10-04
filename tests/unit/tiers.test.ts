import { readFileSync } from "node:fs";
import { createElement } from "react";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { auth } from "@/auth";
import { GET as costGet } from "@/app/api/v1/super/ai/costs/route";
import { SalonAiForm } from "@/components/admin/SalonAiForm";
import { UnknownModelError } from "@/lib/ai/errors";
import { guestPreviewHeaders } from "@/lib/ai/guest-response";
import { GeminiProvider } from "@/lib/ai/gemini";
import { OpenAIProvider } from "@/lib/ai/openai";
import { generateWithFailover } from "@/lib/ai/router";
import { salonAiView } from "@/lib/ai/settings-store";
import { beginPaidCall, costPerCallInr } from "@/lib/ai/spend";
import { costUsdFromUsage, exactInr, projectSalonMonth, resolveGuestTier, tierRequest } from "@/lib/ai/tiers";
import { runLockedEdit } from "@/lib/face/pipeline";
import { calibrationFixtures } from "@/lib/ai/calibrate";
import { prisma } from "@/lib/prisma";
import type { GenerateInput } from "@/lib/ai/types";

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
}));

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.AI_SPEND_CAP_INR;
  delete process.env.OPENAI_IMAGE_MODEL_MEDIUM;
  delete process.env.OPENAI_IMAGE_MODEL_TEST;
  delete process.env.OPENAI_IMAGE_MODEL_HIGH;
  delete process.env.GEMINI_MODEL_STANDARD;
  delete process.env.AI_COST_PER_CALL_INR_OPENAI_TEST;
  delete process.env.AI_COST_PER_CALL_INR_OPENAI_MEDIUM;
  delete process.env.AI_COST_PER_CALL_INR_OPENAI_HIGH;
  return prisma.platformSetting.deleteMany({ where: { key: { in: ["platform_ai_tier", "platform_ai_high_enabled", "platform_ai_medium_approved"] } } });
});

function input(image: Buffer, tier: GenerateInput["tier"]): GenerateInput {
  return {
    image,
    styleId: "soft-bob",
    gender: "women",
    prompt: "Trim the hair only.",
    tenantId: "tier-unit",
    quality: "standard",
    tier,
    kind: "style",
  };
}

async function jpeg(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#c4622d" } }).jpeg().toBuffer();
}

describe("tier catalogue", () => {
  it("prices OpenAI and Gemini tiers from the checked list prices", () => {
    const test = tierRequest("openai", "test");
    const medium = tierRequest("openai", "medium");
    const high = tierRequest("openai", "high");
    expect(test).toMatchObject({ model: "gpt-image-1-mini", quality: "low", size: "1024x1024", inputLongSide: 768, estimateUsd: 0.005, estimateInr: 0.6 });
    expect(medium).toMatchObject({ model: "gpt-image-1-mini", quality: "medium", size: "1024x1024", estimateUsd: 0.011, estimateInr: 1.2 });
    expect(high).toMatchObject({ model: "gpt-image-1", quality: "high", size: "1024x1024", estimateUsd: 0.167, estimateInr: 17.4 });
    expect(tierRequest("gemini", "test")).toMatchObject({ model: "gemini-3.1-flash-lite-image", quality: "lite", estimateUsd: 0.0336, estimateInr: 3.5 });
    expect(tierRequest("gemini", "medium").estimateInr).toBe(7);
    expect(tierRequest("gemini", "high")).toMatchObject({ model: "gemini-3.1-flash-image", quality: "HD", estimateInr: 7 });
    process.env.OPENAI_IMAGE_MODEL_MEDIUM = "gpt-image-1";
    expect(tierRequest("openai", "medium")).toMatchObject({ model: "gpt-image-1", quality: "medium", estimateUsd: 0.042, estimateInr: 4.4 });
  });

  it("computes token cost and keeps high off unless it is enabled", () => {
    const usd = costUsdFromUsage("gpt-image-1-mini", { textTokens: 20, imageTokens: 80, outputTokens: 272, inputTokens: 100, totalTokens: 372 });
    expect(usd).toBe(0.002416);
    expect(exactInr(usd || 0)).toBe(0.23);
    const gemini = costUsdFromUsage("gemini-3.1-flash-lite-image", { inputTokens: 80, outputTokens: 1120, totalTokens: 1200 });
    expect(gemini).toBe(0.03362);
    expect(resolveGuestTier({ stored: "high", highEnabled: false, mediumApproved: false, purpose: "guest" })).toBe("test");
    expect(resolveGuestTier({ stored: "high", highEnabled: false, mediumApproved: true, purpose: "guest" })).toBe("medium");
    expect(resolveGuestTier({ stored: "medium", highEnabled: true, mediumApproved: false, purpose: "guest" })).toBe("test");
    expect(resolveGuestTier({ stored: "high", highEnabled: true, mediumApproved: true, purpose: "calibration" })).toBe("test");
    expect(resolveGuestTier({ stored: "high", highEnabled: true, mediumApproved: true, purpose: "guest" })).toBe("high");
    const plans = projectSalonMonth(2, 100);
    expect(plans.map((plan) => [plan.name, plan.priceInr, plan.marginInr])).toEqual([
      ["Starter", 799, 599],
      ["Pro", 1999, 1799],
      ["Chain", 4999, 4799],
    ]);
  });
});

describe("provider requests", () => {
  it("sends the configured OpenAI model, quality, and size for each tier", async () => {
    const big = await jpeg(1200, 1600);
    const tiny = await jpeg(16, 16);
    for (const tier of ["test", "medium", "high"] as const) {
      const seen: { model: string; quality: string; size: string; long: number }[] = [];
      globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
        const form = init?.body as FormData;
        const blob = form.get("image[]") as Blob;
        const meta = await sharp(Buffer.from(await blob.arrayBuffer())).metadata();
        seen.push({
          model: String(form.get("model")),
          quality: String(form.get("quality")),
          size: String(form.get("size")),
          long: Math.max(meta.width || 0, meta.height || 0),
        });
        return new Response(JSON.stringify({ data: [{ b64_json: tiny.toString("base64") }], usage: { input_tokens: 100, output_tokens: 272, total_tokens: 372, input_tokens_details: { text_tokens: 20, image_tokens: 80 } } }), { status: 200 });
      }) as typeof fetch;
      const output = await new OpenAIProvider("openai-test-key").generate(input(big, tier));
      const spec = tierRequest("openai", tier);
      expect(seen).toEqual([{ model: spec.model, quality: spec.openaiQuality, size: "1024x1024", long: tier === "test" ? 768 : 1600 }]);
      expect(output.model).toBe(spec.model);
      expect(output.usage?.outputTokens).toBe(272);
    }
  });

  it("calls Gemini with the test model id and does not retry an unknown OpenAI model", async () => {
    const tiny = await jpeg(32, 32);
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      urls.push(String(url));
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: tiny.toString("base64") } }] } }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 1120, totalTokenCount: 1132 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const gemini = await new GeminiProvider("gemini-test-key").generate({ ...input(tiny, "test"), tier: "test" });
    expect(urls.some((url) => url.includes("gemini-3.1-flash-lite-image"))).toBe(true);
    expect(gemini.model).toBe("gemini-3.1-flash-lite-image");
    expect(gemini.usage?.outputTokens).toBe(1120);

    let hits = 0;
    globalThis.fetch = vi.fn(async () => {
      hits += 1;
      return new Response(JSON.stringify({ error: { code: "model_not_found", message: "The model does not exist" } }), { status: 400 });
    }) as typeof fetch;
    await expect(new OpenAIProvider("openai-test-key").generate(input(tiny, "test"))).rejects.toBeInstanceOf(UnknownModelError);
    expect(hits).toBe(1);
    process.env.AI_SPEND_CAP_INR = "50";
    await prisma.aiCall.deleteMany();
    hits = 0;
    const portrait = (await calibrationFixtures())[0].image;
    await expect(generateWithFailover({ ...input(portrait, "high"), tenantId: "unknown-model-guest" }, { name: "openai", apiKey: "openai-test-key" })).rejects.toThrow(/not available|model/i);
    expect(hits).toBe(1);
    expect(await prisma.aiCall.count({ where: { status: "CHARGED" } })).toBe(0);
    expect(await prisma.aiCall.count({ where: { status: "REFUNDED" } })).toBe(1);
    const face = (await calibrationFixtures())[0].image;
    let edits = 0;
    const locked = await runLockedEdit({
      image: face,
      tool: "style",
      edit: async () => {
        edits += 1;
        throw new UnknownModelError();
      },
    });
    expect(edits).toBe(1);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.reason).toBe("unknown-model");
  });

  it("counts tier estimates against the cap and will not call high unless it is enabled", async () => {
    process.env.AI_SPEND_CAP_INR = "1";
    expect(costPerCallInr("openai", "test")).toBe(0.6);
    expect(costPerCallInr("openai", "medium")).toBe(1.2);
    expect(costPerCallInr("openai", "high")).toBe(17.4);
    expect(costPerCallInr("gemini", "test")).toBe(3.5);
    await prisma.aiCall.deleteMany();
    const first = await beginPaidCall({ provider: "openai", quality: "test", model: "gpt-image-1-mini", tenantId: "tier-cap", tier: "test", estimateInr: 0.6, estimateUsd: 0.005 });
    const second = await beginPaidCall({ provider: "openai", quality: "test", model: "gpt-image-1-mini", tenantId: "tier-cap", tier: "test", estimateInr: 0.6, estimateUsd: 0.005 });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    process.env.AI_SPEND_CAP_INR = "10";
    const high = await beginPaidCall({ provider: "openai", quality: "high", model: "gpt-image-1", tenantId: "tier-cap", tier: "high" });
    expect(high.ok).toBe(false);
    expect(high.estimateInr).toBe(17.4);

    await prisma.platformSetting.upsert({ where: { key: "platform_ai_tier" }, update: { value: "high" }, create: { key: "platform_ai_tier", value: "high" } });
    await prisma.platformSetting.upsert({ where: { key: "platform_ai_high_enabled" }, update: { value: "false" }, create: { key: "platform_ai_high_enabled", value: "false" } });
    await prisma.platformSetting.upsert({ where: { key: "platform_ai_medium_approved" }, update: { value: "false" }, create: { key: "platform_ai_medium_approved", value: "false" } });
    const face = (await calibrationFixtures())[0].image;
    const seen: { model: string; quality: string }[] = [];
    const tiny = await jpeg(24, 24);
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData;
      seen.push({ model: String(form.get("model")), quality: String(form.get("quality")) });
      return new Response(JSON.stringify({ data: [{ b64_json: tiny.toString("base64") }] }), { status: 200 });
    }) as typeof fetch;
    await generateWithFailover(
      { ...input(face, "high"), tenantId: "guest-tier-check" },
      { name: "openai", apiKey: "openai-test-key" },
    );
    expect(seen[0]).toEqual({ model: "gpt-image-1-mini", quality: "low" });
    expect(seen.every((row) => row.quality !== "high" && row.model !== "gpt-image-1")).toBe(true);
    await prisma.platformSetting.deleteMany({ where: { key: { in: ["platform_ai_tier", "platform_ai_high_enabled", "platform_ai_medium_approved"] } } });
    await prisma.aiCall.deleteMany();
  });
});

describe("cost privacy", () => {
  it("keeps cost and model fields off guest and salon responses", async () => {
    const headers = guestPreviewHeaders({ tryOnId: "try-1", creditsLeft: 3, demoReason: "no-key" });
    expect(headers).not.toHaveProperty("x-provider");
    expect(headers).not.toHaveProperty("x-estimate-inr");
    expect(JSON.stringify(headers)).not.toMatch(/gpt-image|gemini-3|estimateInr|costUsd|costInr/);
    const route = readFileSync("src/app/api/v1/tryon/generate/route.ts", "utf8");
    const guest = readFileSync("src/components/tryon/TryOnApp.tsx", "utf8");
    const salon = readFileSync("src/components/admin/SalonAiForm.tsx", "utf8");
    const admin = readFileSync("src/app/admin/ai/page.tsx", "utf8");
    for (const source of [route, guest, salon, admin]) {
      expect(source).not.toMatch(/gpt-image|gemini-3\.1|estimateInr|providerCost|costUsd|spentInr|x-provider|x-estimate-inr/);
    }
    expect(admin + guest).not.toMatch(/SuperCostPanel|SuperAiForm/);
    const html = renderToStaticMarkup(
      createElement(SalonAiForm, {
        initial: { provider: "openai", hasKey: false, hint: "", allowByo: false, tier: "test", mediumApproved: false, highEnabled: false },
        showKey: false,
      }),
    );
    expect(html).not.toMatch(/gpt-image|gemini-3|estimateInr|₹|costUsd|spentInr/);
    const tenant = await prisma.tenant.create({ data: { slug: `tier-${Date.now()}`, name: "Tier salon", aiTier: "test" } });
    const view = await salonAiView(tenant.id);
    expect(JSON.stringify(view)).not.toMatch(/gpt-image|gemini-3|estimateInr|spentInr|costUsd|choices|capInr/);
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  it("returns 403 from the cost endpoint unless the caller is a super-admin", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const guest = await costGet(new Request("http://localhost/api/v1/super/ai/costs"));
    expect(guest.status).toBe(403);
    vi.mocked(auth).mockResolvedValue({ user: { id: "owner", isSuperAdmin: false, email: "owner@demo.helixstac.app" }, expires: "2099-01-01T00:00:00.000Z" });
    const owner = await costGet(new Request("http://localhost/api/v1/super/ai/costs"));
    expect(owner.status).toBe(403);
    vi.mocked(auth).mockResolvedValue({ user: { id: "super", isSuperAdmin: true, email: "super@helixstac.app" }, expires: "2099-01-01T00:00:00.000Z" });
    const allowed = await costGet(new Request("http://localhost/api/v1/super/ai/costs?imagesPerMonth=100"));
    expect(allowed.status).toBe(200);
    const body = await allowed.json();
    expect(body.plans.map((plan: { priceInr: number }) => plan.priceInr)).toEqual([799, 1999, 4999]);
    expect(body.calls.length).toBeLessThanOrEqual(50);
  });
});
