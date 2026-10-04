import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { comparisonModel, quoteComparisonModel } from "@/lib/ai/compare-models";
import { resolveOpenRouterKey } from "@/lib/ai/credentials";
import { BilledProviderError } from "@/lib/ai/errors";
import { buildOpenRouterChatBody } from "@/lib/ai/openrouter-models";
import { postOpenRouterReferenceEdit } from "@/lib/ai/openrouter-reference";
import { executeReferenceEdit } from "@/lib/ai/reference-run";
import { saveOpenRouterKey } from "@/lib/ai/settings-store";
import { costUsdFromUsage } from "@/lib/ai/tiers";
import { encryptSecret } from "@/lib/crypto/secret";
import { prisma } from "@/lib/prisma";

const originalFetch = globalThis.fetch;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("openrouter comparison", () => {
  afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    await prisma.platformSetting.deleteMany({
      where: {
        key: {
          in: [
            "platform_openrouter_key_cipher",
            "platform_openrouter_key_hint",
            "platform_openrouter_enabled",
          ],
        },
      },
    });
    await prisma.aiCall.deleteMany();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("quotes the verified chat models and refuses a prefix or a router", () => {
    expect(comparisonModel("openrouter/auto")).toBeNull();
    expect(comparisonModel("google/gemini")).toBeNull();
    expect(comparisonModel("google/gemini-3.1-flash-image-preview")).toBeNull();
    expect(comparisonModel("openai/gpt-image-2")).toBeNull();
    expect(comparisonModel("gpt-image-2")?.provider).toBe("openai");
    expect(comparisonModel("openai/gpt-5-image")?.provider).toBe("openrouter");
    const cases: [string, number][] = [
      ["google/gemini-2.5-flash-image", 3.7],
      ["google/gemini-3.1-flash-lite-image", 3.6],
      ["google/gemini-3.1-flash-image", 7.2],
      ["google/gemini-3-pro-image", 14.8],
      ["openai/gpt-5-image-mini", 2.8],
      ["openai/gpt-5.4-image-2", 9.9],
      ["openai/gpt-5-image", 29.1],
    ];
    for (const [id, cap] of cases) {
      const quote = quoteComparisonModel(id, 480, 640, { width: 512, height: 512 });
      expect(quote.ok, id).toBe(true);
      if (!quote.ok) continue;
      expect(quote.provider).toBe("openrouter");
      expect(quote.estimateInr).toBe(cap);
      expect(quote.size).toBe("2:3");
    }
  });

  it("sends text, then the selfie, then the reference, with fallbacks off", () => {
    const body = buildOpenRouterChatBody("google/gemini-3.1-flash-image", {
      prompt: "Image 1 is the person. Image 2 is the haircut.",
      selfieDataUrl: "data:image/png;base64,SELFIE",
      referenceDataUrl: "data:image/jpeg;base64,REFERENCE",
      aspectRatio: "2:3",
    });
    expect(body?.model).toBe("google/gemini-3.1-flash-image");
    expect(body?.models).toEqual(["google/gemini-3.1-flash-image"]);
    expect(body?.modalities).toEqual(["image", "text"]);
    expect(body?.provider).toEqual({ allow_fallbacks: false });
    expect(body).not.toHaveProperty("route");
    expect(body).not.toHaveProperty("plugins");
    const content = body?.messages[0]?.content || [];
    expect(content.map((part) => part.type)).toEqual(["text", "image_url", "image_url"]);
    expect(content[1]).toMatchObject({ image_url: { url: "data:image/png;base64,SELFIE" } });
    expect(content[2]).toMatchObject({ image_url: { url: "data:image/jpeg;base64,REFERENCE" } });
    expect(JSON.stringify(body)).not.toMatch(/fal-ai\//);
  });

  it("refuses a missing OpenRouter key before any request", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("fetch should not run");
    }) as typeof fetch;
    const jpeg = await sharp({ create: { width: 80, height: 120, channels: 3, background: "#886655" } }).jpeg().toBuffer();
    const result = await executeReferenceEdit({
      jpeg,
      original: jpeg,
      styleId: "long-layers",
      tenantId: "openrouter-missing",
      source: "tryon",
      tool: "reference",
      modelId: "google/gemini-3.1-flash-image",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("NO_OPENROUTER_KEY");
      expect(result.message).toMatch(/does not call OpenAI, Gemini, or fal/);
    }
    expect(calls).toBe(0);
    expect(await prisma.aiCall.count({ where: { tenantId: "openrouter-missing" } })).toBe(0);
  });

  it("posts once and records an unknown bill when the request does not return", async () => {
    await saveOpenRouterKey({ apiKey: "openrouter-test-key", enabled: true, remove: false }, "super");
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("socket hang up");
    }) as typeof fetch;
    const jpeg = await sharp({ create: { width: 80, height: 120, channels: 3, background: "#886655" } }).jpeg().toBuffer();
    const result = await executeReferenceEdit({
      jpeg,
      original: jpeg,
      styleId: "long-layers",
      tenantId: "openrouter-timeout",
      source: "tryon",
      tool: "reference",
      modelId: "google/gemini-2.5-flash-image",
    });
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.outcome).toBe("uncertain");
    const call = await prisma.aiCall.findFirst({ where: { tenantId: "openrouter-timeout" } });
    expect(call?.status).toBe("UNCERTAIN");
    expect(call?.charged).toBe(true);
  });

  it("does not log the key or the image bytes", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const selfie = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ccbbaa" } }).png().toBuffer();
    const reference = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#998877" } }).jpeg().toBuffer();
    const secret = "openrouter-test-key";
    const leaked = `data:image/png;base64,${selfie.toString("base64")}`;
    const fetchImpl = (async () => new Response(`bad ${secret} ${leaked}`, { status: 400 })) as typeof fetch;
    await expect(postOpenRouterReferenceEdit({
      apiKey: secret,
      modelId: "google/gemini-3.1-flash-image",
      prompt: "Image 1 is the person. Image 2 is the haircut.",
      selfiePng: selfie,
      referenceJpeg: reference,
      width: 80,
      height: 120,
      estimateUsd: 0.07,
      fetchImpl,
    })).rejects.toThrow(/data:image\/\[redacted\]/);
    const thrown = await postOpenRouterReferenceEdit({
      apiKey: secret,
      modelId: "google/gemini-3.1-flash-image",
      prompt: "Image 1 is the person.",
      selfiePng: selfie,
      referenceJpeg: reference,
      width: 80,
      height: 120,
      estimateUsd: 0.07,
      fetchImpl,
    }).catch((cause: unknown) => cause);
    const text = thrown instanceof Error ? thrown.message : "";
    expect(text).not.toContain(secret);
    expect(text).not.toContain(selfie.toString("base64").slice(0, 40));
    const logged = [...info.mock.calls, ...error.mock.calls].flat().map((part) => JSON.stringify(part)).join("\n");
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain(selfie.toString("base64").slice(0, 24));
  });

  it("keeps usage.cost as the actual charge and does not call a second model", async () => {
    const png = await sharp({ create: { width: 16, height: 24, channels: 3, background: "#d8c8b8" } }).png().toBuffer();
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
    let calls = 0;
    let sent = "";
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      calls += 1;
      sent = String(init?.body || "");
      return json({
        model: "google/gemini-3.1-flash-image",
        choices: [{ message: { images: [{ image_url: { url: dataUrl } }] } }],
        usage: { prompt_tokens: 10, completion_tokens: 1120, total_tokens: 1130, cost: 0.04 },
      });
    }) as typeof fetch;
    const selfie = await sharp({ create: { width: 12, height: 16, channels: 3, background: "#ccbbaa" } }).png().toBuffer();
    const reference = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#998877" } }).jpeg().toBuffer();
    const result = await postOpenRouterReferenceEdit({
      apiKey: "openrouter-test-key",
      modelId: "google/gemini-3.1-flash-image",
      prompt: "Image 1 is the person. Image 2 is the haircut.",
      selfiePng: selfie,
      referenceJpeg: reference,
      width: 480,
      height: 640,
      estimateUsd: 0.07,
      fetchImpl,
    });
    expect(calls).toBe(1);
    expect(sent).toContain("\"models\":[\"google/gemini-3.1-flash-image\"]");
    expect(sent).toContain("\"allow_fallbacks\":false");
    expect(sent).not.toContain("\"route\"");
    expect(result.costFromUsage).toBe(true);
    expect(costUsdFromUsage("google/gemini-3.1-flash-image", result.usage)).toBe(0.04);
    const wrong = (async () => {
      const mismatch = (async () => json({
        model: "google/gemini-3-pro-image",
        choices: [{ message: { images: [{ image_url: { url: dataUrl } }] } }],
        usage: { cost: 0.11 },
      })) as typeof fetch;
      return postOpenRouterReferenceEdit({
        apiKey: "openrouter-test-key",
        modelId: "google/gemini-3.1-flash-image",
        prompt: "Image 1 is the person.",
        selfiePng: selfie,
        referenceJpeg: reference,
        width: 80,
        height: 120,
        estimateUsd: 0.07,
        fetchImpl: mismatch,
      });
    })();
    await expect(wrong).rejects.toBeInstanceOf(BilledProviderError);
    await expect(wrong).rejects.toThrow(/was not retried/);
  });

  it("does not use the environment key when the saved key is off", async () => {
    await prisma.platformSetting.upsert({
      where: { key: "platform_openrouter_key_cipher" },
      update: { value: encryptSecret("openrouter-test-key") },
      create: { key: "platform_openrouter_key_cipher", value: encryptSecret("openrouter-test-key") },
    });
    await prisma.platformSetting.upsert({
      where: { key: "platform_openrouter_enabled" },
      update: { value: "false" },
      create: { key: "platform_openrouter_enabled", value: "false" },
    });
    process.env.OPENROUTER_API_KEY = "env-key-should-not-win";
    expect(await resolveOpenRouterKey()).toEqual({ ok: false, reason: "off" });
  });
});
