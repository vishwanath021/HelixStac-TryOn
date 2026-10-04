import { readFileSync } from "node:fs";
import http from "node:http";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { COMPARISON_MODELS, comparisonModel, quoteComparisonModel } from "@/lib/ai/compare-models";
import { resolveFalKey, resolveOpenAIKey } from "@/lib/ai/credentials";
import { BilledProviderError, UncertainBillingError } from "@/lib/ai/errors";
import { buildFalEditBody, falModel } from "@/lib/ai/fal-models";
import { falTimeoutMs, falWaitingLabel } from "@/lib/ai/fal-wait";
import { falSubmitHeaders, postFalReferenceEdit } from "@/lib/ai/fal-reference";
import { relaxHttpServerTimeouts } from "@/lib/http/server-timeout";
import { productionModelNotice } from "@/lib/ai/model-notices";
import { executeReferenceEdit } from "@/lib/ai/reference-run";
import { saveFalKey, savePlatformAi } from "@/lib/ai/settings-store";
import { tierRequest } from "@/lib/ai/tiers";
import { encryptSecret } from "@/lib/crypto/secret";
import { prisma } from "@/lib/prisma";

const portrait = { width: 512, height: 512 };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("fal and shutdown catalogue", () => {
  afterEach(async () => {
    await prisma.platformSetting.deleteMany({
      where: {
        key: {
          in: [
            "platform_openai_key_cipher",
            "platform_openai_key_hint",
            "platform_gemini_key_cipher",
            "platform_gemini_key_hint",
            "platform_ai_key_cipher",
            "platform_ai_key_hint",
            "platform_ai_provider",
            "platform_fal_key_cipher",
            "platform_fal_key_hint",
            "platform_fal_enabled",
          ],
        },
      },
    });
    await prisma.aiCall.deleteMany();
    delete process.env.FAL_KEY;
    delete process.env.FAL_TIMEOUT_MS;
    delete process.env.FAL_QUEUE_DEADLINE_MS;
  });

  it("waits one hour by default and labels the elapsed wait", () => {
    expect(falTimeoutMs()).toBe(3_600_000);
    expect(falWaitingLabel(12, 3600)).toBe("Still waiting. 12s elapsed. This can take up to 3600 seconds.");
    const generate = readFileSync("src/app/api/v1/tryon/generate/route.ts", "utf8");
    const benchmark = readFileSync("src/app/api/v1/super/ai/benchmark/route.ts", "utf8");
    const config = readFileSync("next.config.ts", "utf8");
    expect(generate).toContain("export const maxDuration = 3780");
    expect(benchmark).toContain("export const maxDuration = 3780");
    expect(config).toContain("proxyTimeout: 3_780_000");
  });

  it("defaults to sunburst, keeps shutdown warnings, and refuses a prefix", () => {
    expect(COMPARISON_MODELS[0]?.id).toBe("gpt-image-2.5-sunburst");
    expect(comparisonModel("gpt-image-2.5")).toBeNull();
    expect(comparisonModel("fal-ai/flux-2")).toBeNull();
    expect(comparisonModel("fal-ai/qwen-image-edit-plus")).toBeNull();
    expect(comparisonModel("gpt-image-1.5")?.label).toContain("1 Dec 2026");
    expect(productionModelNotice("gpt-image-1-mini")).toContain("1 Dec 2026");
    expect(productionModelNotice("gpt-image-1")).toContain("23 Oct 2026");
    const testTier = tierRequest("openai", "test");
    const medium = tierRequest("openai", "medium");
    const high = tierRequest("openai", "high");
    expect(testTier.model).toBe("gpt-image-1-mini");
    expect(medium.model).toBe("gpt-image-1-mini");
    expect(high.model).toBe("gpt-image-1");
    expect(testTier.quality).toBe("low");
    expect(high.quality).toBe("high");
    expect(testTier.estimateInr).toBeGreaterThan(0);
    expect(high.estimateInr).toBeGreaterThan(testTier.estimateInr);
  });

  it("quotes the documented 1024x1536 range and builds image_urls in order", () => {
    const cases: [string, number, number][] = [
      ["fal-ai/flux-2/edit", 2.96, 4.12],
      ["fal-ai/flux-2-pro/edit", 4.32, 7.2],
      ["fal-ai/qwen-image-edit-2511", 4.53, 10.29],
      ["fal-ai/bytedance/seedream/v4/edit", 2.88, 2.88],
      ["fal-ai/flux-2/klein/9b/edit", 2.72, 3.77],
      ["fal-ai/flux-2/klein/4b/edit", 1.51, 3.43],
      ["fal-ai/nano-banana/edit", 3.74, 3.74],
    ];
    for (const [id, low, high] of cases) {
      const quote = quoteComparisonModel(id, 480, 640, portrait);
      expect(quote.ok, id).toBe(true);
      if (!quote.ok) continue;
      expect(quote.provider).toBe("fal");
      expect(quote.size).toBe("1024x1536");
      expect(quote.rangeLowInr).toBeCloseTo(low, 2);
      expect(quote.rangeHighInr).toBeCloseTo(high, 2);
      expect(quote.estimateInr).toBeGreaterThanOrEqual(high);
      expect(quote.estimateInr).toBeLessThanOrEqual(30);
      expect(quote.note).toMatch(/8% buffer/);
    }
    const flux = buildFalEditBody("fal-ai/flux-2/edit", {
      prompt: "Image 1 is the person. Image 2 is the hair.",
      selfieUrl: "https://cdn.example/selfie.png",
      referenceUrl: "https://cdn.example/reference.jpg",
      size: "1024x1536",
    });
    expect(flux?.image_urls).toEqual(["https://cdn.example/selfie.png", "https://cdn.example/reference.jpg"]);
    expect(flux?.enable_safety_checker).toBe(true);
    expect(flux?.num_images).toBe(1);
    expect(flux).not.toHaveProperty("seed");
    expect(JSON.stringify(flux)).not.toMatch(/mask/i);
    expect(falSubmitHeaders("fal-test-key")["X-Fal-No-Retry"]).toBe("1");
    const nano = buildFalEditBody("fal-ai/nano-banana/edit", {
      prompt: "edit",
      selfieUrl: "https://cdn.example/selfie.png",
      referenceUrl: "https://cdn.example/reference.jpg",
      size: "1024x1536",
    });
    expect(nano?.aspect_ratio).toBe("2:3");
    expect(nano).not.toHaveProperty("enable_safety_checker");
    const seedream = buildFalEditBody("fal-ai/bytedance/seedream/v4/edit", {
      prompt: "edit",
      selfieUrl: "https://cdn.example/selfie.png",
      referenceUrl: "https://cdn.example/reference.jpg",
      size: "1024x1536",
    });
    expect(seedream?.image_size).toEqual({ width: 1024, height: 1536 });
    expect(seedream?.max_images).toBe(1);
    expect(falModel("fal-ai/qwen-image-edit-plus")).toBeNull();
  });

  it("refuses a missing fal key before any request", async () => {
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
      tenantId: "fal-missing",
      source: "tryon",
      tool: "reference",
      modelId: "fal-ai/flux-2/edit",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("NO_FAL_KEY");
      expect(result.message).toMatch(/does not call OpenAI or Gemini/);
    }
    expect(calls).toBe(0);
    const reserved = await prisma.aiCall.count({ where: { tenantId: "fal-missing" } });
    expect(reserved).toBe(0);
  });

  it("submits once with no retry and records an unknown bill on timeout", async () => {
    await saveFalKey({ apiKey: "fal-test-key-123456", enabled: true, remove: false }, "super");
    process.env.FAL_TIMEOUT_MS = "0";
    const submits: { url: string; retry: string }[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      const headers = new Headers(init?.headers);
      if (href.includes("/storage/upload/initiate")) {
        return json({ upload_url: "https://upload.example/put", file_url: "https://v3.fal.media/files/in.png" });
      }
      if (href.startsWith("https://upload.example")) return new Response(null, { status: 200 });
      if (href.startsWith("https://queue.fal.run/") && !href.includes("/requests/")) {
        submits.push({ url: href, retry: headers.get("X-Fal-No-Retry") || "" });
        return json({ request_id: "req-1", status_url: "https://queue.fal.run/fal-ai/flux-2/edit/requests/req-1/status" });
      }
      return json({ status: "IN_PROGRESS" });
    }) as typeof fetch;
    const jpeg = await sharp({ create: { width: 80, height: 120, channels: 3, background: "#886655" } }).jpeg().toBuffer();
    const result = await executeReferenceEdit({
      jpeg,
      original: jpeg,
      styleId: "long-layers",
      tenantId: "fal-timeout",
      source: "tryon",
      tool: "reference",
      modelId: "fal-ai/flux-2/edit",
    });
    expect(submits).toHaveLength(1);
    expect(submits[0]?.retry).toBe("1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("UNCERTAIN");
      expect(result.providerRequestId).toBe("req-1");
      expect(result.message).toContain("fal request req-1");
      expect(result.message).toContain("was not submitted again");
    }
    const call = await prisma.aiCall.findFirst({ where: { tenantId: "fal-timeout" } });
    expect(call?.status).toBe("UNCERTAIN");
    expect(call?.charged).toBe(true);
    expect(call?.providerRequestId).toBe("req-1");
    const run = await prisma.benchmarkRun.findFirst({ where: { callId: call?.id || "" } });
    expect(run?.providerRequestId).toBe("req-1");
    expect(run?.status).toBe("UNCERTAIN");
  });

  it("reports a black fal frame as a safety block and does not submit again", async () => {
    const black = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000000" } }).png().toBuffer();
    let submits = 0;
    const fetchImpl = (async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/storage/upload/initiate")) {
        return json({ upload_url: "https://upload.example/put", file_url: "https://v3.fal.media/files/in.png" });
      }
      if (href.startsWith("https://upload.example")) return new Response(null, { status: 200 });
      if (href.startsWith("https://queue.fal.run/") && !href.includes("/requests/")) {
        submits += 1;
        return json({ request_id: "req-black" });
      }
      if (href.endsWith("/status")) return json({ status: "COMPLETED" });
      if (href.includes("/requests/req-black") && !href.endsWith("/status")) {
        return json({ images: [{ url: "https://v3.fal.media/files/black.png" }], has_nsfw_concepts: [false] });
      }
      if (href.startsWith("https://v3.fal.media/")) return new Response(new Uint8Array(black), { status: 200 });
      throw new Error(`unexpected ${href}`);
    }) as typeof fetch;
    const selfie = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#ccbbaa" } }).png().toBuffer();
    const reference = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#998877" } }).jpeg().toBuffer();
    await expect(postFalReferenceEdit({
      apiKey: "fal-test-key-123456",
      endpointId: "fal-ai/flux-2/edit",
      prompt: "Image 1 stays. Image 2 supplies the cut.",
      selfiePng: selfie,
      referenceJpeg: reference,
      size: "1024x1536",
      estimateUsd: 0.05,
      fetchImpl,
      now: () => 0,
      deadlineMs: 10_000,
      sleep: async () => undefined,
    })).rejects.toBeInstanceOf(BilledProviderError);
    expect(submits).toBe(1);
    await expect(postFalReferenceEdit({
      apiKey: "fal-test-key-123456",
      endpointId: "not-a-model",
      prompt: "x",
      selfiePng: selfie,
      referenceJpeg: reference,
      size: "1024x1024",
      estimateUsd: 0.05,
      fetchImpl,
    })).rejects.toThrow(/No other model was called/);
    expect(submits).toBe(1);
  });

  it("keeps a saved OpenAI key when the guest provider moves, and keeps a fal key off until enabled", async () => {
    await savePlatformAi({ provider: "openai", apiKey: "openai-test-key-123456", allowByo: false, tier: "test", highEnabled: false }, "super");
    await savePlatformAi({ provider: "gemini", apiKey: "", allowByo: false, tier: "test", highEnabled: false }, "super");
    expect(await resolveOpenAIKey()).toBe("openai-test-key-123456");
    await prisma.platformSetting.deleteMany({ where: { key: { in: ["platform_openai_key_cipher", "platform_openai_key_hint"] } } });
    await prisma.platformSetting.upsert({
      where: { key: "platform_ai_provider" },
      update: { value: "gemini" },
      create: { key: "platform_ai_provider", value: "gemini" },
    });
    await prisma.platformSetting.upsert({
      where: { key: "platform_ai_key_cipher" },
      update: { value: encryptSecret("sk-shortkey123456") },
      create: { key: "platform_ai_key_cipher", value: encryptSecret("sk-shortkey123456") },
    });
    expect(await resolveOpenAIKey()).toBe("sk-shortkey123456");
    await prisma.platformSetting.upsert({
      where: { key: "platform_fal_key_cipher" },
      update: { value: encryptSecret("fal-test-key-123456") },
      create: { key: "platform_fal_key_cipher", value: encryptSecret("fal-test-key-123456") },
    });
    await prisma.platformSetting.upsert({
      where: { key: "platform_fal_enabled" },
      update: { value: "false" },
      create: { key: "platform_fal_enabled", value: "false" },
    });
    process.env.FAL_KEY = "fal-env-should-not-win";
    expect(await resolveFalKey()).toEqual({ ok: false, reason: "off" });
    await saveFalKey({ apiKey: "", enabled: true, remove: false }, "super");
    expect(await resolveFalKey()).toEqual({ ok: true, apiKey: "fal-test-key-123456" });
  });

  it("treats a lost queue reply as an unknown bill without a second submit", async () => {
    let submits = 0;
    const fetchImpl = (async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/storage/upload/initiate")) return json({ upload_url: "https://upload.example/put", file_url: "https://v3.fal.media/files/in.png" });
      if (href.startsWith("https://upload.example")) return new Response(null, { status: 200 });
      if (href.startsWith("https://queue.fal.run/") && !href.includes("/requests/")) {
        submits += 1;
        throw new Error("socket hang up");
      }
      throw new Error("unexpected");
    }) as typeof fetch;
    const selfie = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ccbbaa" } }).png().toBuffer();
    await expect(postFalReferenceEdit({
      apiKey: "fal-test-key-123456",
      endpointId: "fal-ai/flux-2/edit",
      prompt: "edit",
      selfiePng: selfie,
      referenceJpeg: selfie,
      size: "1024x1536",
      estimateUsd: 0.05,
      fetchImpl,
      deadlineMs: 0,
    })).rejects.toBeInstanceOf(UncertainBillingError);
    expect(submits).toBe(1);
  });

  it("keeps polling the same request until a slow queue completes", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#cc8866" } }).png().toBuffer();
    let submits = 0;
    let statusReads = 0;
    let resultReads = 0;
    let clock = 0;
    const fetchImpl = (async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/storage/upload/initiate")) return json({ upload_url: "https://upload.example/put", file_url: "https://v3.fal.media/files/in.png" });
      if (href.startsWith("https://upload.example")) return new Response(null, { status: 200 });
      if (href.startsWith("https://queue.fal.run/") && !href.includes("/requests/")) {
        submits += 1;
        return json({ request_id: "req-slow", status_url: "https://queue.fal.run/fal-ai/flux-2/edit/requests/req-slow/status" });
      }
      if (href.endsWith("/status")) {
        statusReads += 1;
        if (statusReads < 3) return json({ status: "IN_PROGRESS" });
        return json({ status: "COMPLETED" });
      }
      if (href.includes("/requests/req-slow")) {
        resultReads += 1;
        if (resultReads === 1) throw new Error("result not ready");
        return json({ images: [{ url: "https://v3.fal.media/files/out.png" }], has_nsfw_concepts: [false] });
      }
      if (href.startsWith("https://v3.fal.media/")) return new Response(new Uint8Array(png), { status: 200 });
      throw new Error(`unexpected ${href}`);
    }) as typeof fetch;
    const selfie = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#ccbbaa" } }).png().toBuffer();
    const result = await postFalReferenceEdit({
      apiKey: "fal-test-key-123456",
      endpointId: "fal-ai/flux-2/edit",
      prompt: "Image 1 stays. Image 2 supplies the cut.",
      selfiePng: selfie,
      referenceJpeg: selfie,
      size: "1024x1536",
      estimateUsd: 0.05,
      fetchImpl,
      now: () => clock,
      deadlineMs: 20_000,
      sleep: async () => {
        clock += 1_000;
      },
    });
    expect(submits).toBe(1);
    expect(statusReads).toBe(3);
    expect(resultReads).toBe(2);
    expect(result.requestId).toBe("req-slow");
    expect(result.image.length).toBeGreaterThan(8);
  });

  it("stops at the deadline without a second submit when the queue never completes", async () => {
    let submits = 0;
    let statusReads = 0;
    let clock = 0;
    const seenIds: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/storage/upload/initiate")) return json({ upload_url: "https://upload.example/put", file_url: "https://v3.fal.media/files/in.png" });
      if (href.startsWith("https://upload.example")) return new Response(null, { status: 200 });
      if (href.startsWith("https://queue.fal.run/") && !href.includes("/requests/")) {
        submits += 1;
        return json({ request_id: "req-hang" });
      }
      if (href.includes("/requests/req-hang/status")) {
        statusReads += 1;
        return json({ status: "IN_PROGRESS" });
      }
      throw new Error(`unexpected ${href}`);
    }) as typeof fetch;
    const selfie = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ccbbaa" } }).png().toBuffer();
    const error = await postFalReferenceEdit({
      apiKey: "fal-test-key-123456",
      endpointId: "fal-ai/bytedance/seedream/v4/edit",
      prompt: "edit",
      selfiePng: selfie,
      referenceJpeg: selfie,
      size: "1024x1536",
      estimateUsd: 0.03,
      fetchImpl,
      now: () => clock,
      deadlineMs: 3_000,
      sleep: async () => {
        clock += 2_000;
      },
      onRequestId: (requestId) => {
        seenIds.push(requestId);
      },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UncertainBillingError);
    if (error instanceof UncertainBillingError) {
      expect(error.requestId).toBe("req-hang");
      expect(error.message).toContain("did not finish before the deadline");
      expect(error.message).toContain("was not submitted again");
    }
    expect(submits).toBe(1);
    expect(statusReads).toBeGreaterThan(0);
    expect(seenIds).toEqual(["req-hang"]);
  });

  it("raises the node server timeout above the one hour fal wait", async () => {
    process.env.FAL_TIMEOUT_MS = "3600000";
    const server = http.createServer((_req, res) => {
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    relaxHttpServerTimeouts();
    expect(server.requestTimeout).toBeGreaterThanOrEqual(3_600_000);
    expect(server.headersTimeout).toBeGreaterThan(server.requestTimeout);
    const later = http.createServer((_req, res) => {
      res.end("ok");
    });
    await new Promise<void>((resolve) => later.listen(0, "127.0.0.1", () => resolve()));
    expect(later.requestTimeout).toBeGreaterThanOrEqual(3_600_000);
    await new Promise<void>((resolve, reject) => server.close((closeError) => (closeError ? reject(closeError) : resolve())));
    await new Promise<void>((resolve, reject) => later.close((closeError) => (closeError ? reject(closeError) : resolve())));
  });
});
