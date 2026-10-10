import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { COMPARISON_MODELS, comparisonModel, quoteComparisonModel } from "@/lib/ai/compare-models";
import { resolveFalKey, resolveOpenAIKey } from "@/lib/ai/credentials";
import { BilledProviderError, UncertainBillingError } from "@/lib/ai/errors";
import { FAL_NUMBERED_IMAGE_PROMPT, buildFalEditBody, falModel } from "@/lib/ai/fal-models";
import { bufferedInr } from "@/lib/ai/tiers";
import { falSubmitHeaders, falTimeoutMs, postFalReferenceEdit } from "@/lib/ai/fal-reference";
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

  it("waits one hour for a fal comparison unless the deadline is set", () => {
    delete process.env.FAL_TIMEOUT_MS;
    delete process.env.FAL_QUEUE_DEADLINE_MS;
    expect(falTimeoutMs()).toBe(3_600_000);
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
    expect(falModel("fal-ai/qwen-image-edit-plus")).toBeNull();
    expect(falModel("fal-ai/bytedance/seedream/v4/edit")).toBeNull();
  });

  it("prices the newer fal edits first and leaves their size to the endpoint", () => {
    const falIds = COMPARISON_MODELS.filter((row) => row.provider === "fal").map((row) => row.id);
    expect(falIds.slice(0, 5)).toEqual([
      "blackforestlabs/flux-3/edit-image",
      "fal-ai/nano-banana-pro/edit",
      "fal-ai/nano-banana-2/edit",
      "bytedance/seedream/v5/lite/edit",
      "openai/gpt-image-2/edit",
    ]);
    expect(falIds.at(-1)).toBe("fal-ai/nano-banana/edit");
    expect(falIds).not.toContain("fal-ai/bytedance/seedream/v4/edit");
    expect(comparisonModel("fal-ai/bytedance/seedream/v4/edit")).toBeNull();
    expect(comparisonModel("fal-ai/nano-banana/edit")?.label).toContain("older, superseded");
    expect(comparisonModel("gpt-image-2")?.provider).toBe("openai");
    expect(comparisonModel("openai/gpt-image-2/edit")?.provider).toBe("fal");
    const usd: Record<string, number> = {
      "blackforestlabs/flux-3/edit-image": 0.024,
      "fal-ai/nano-banana-pro/edit": 0.15,
      "fal-ai/nano-banana-2/edit": 0.08,
      "bytedance/seedream/v5/lite/edit": 0.035,
      "openai/gpt-image-2/edit": 0.054,
    };
    for (const id of falIds.slice(0, 5)) {
      const body = buildFalEditBody(id, {
        prompt: FAL_NUMBERED_IMAGE_PROMPT,
        selfieUrl: "https://cdn.example/selfie.png",
        referenceUrl: "https://cdn.example/reference.jpg",
        size: "1024x1536",
      });
      const keys: Record<string, string[]> = {
        "blackforestlabs/flux-3/edit-image": ["aspect_ratio", "image_urls", "prompt"],
        "fal-ai/nano-banana-pro/edit": ["aspect_ratio", "image_urls", "prompt"],
        "fal-ai/nano-banana-2/edit": ["aspect_ratio", "image_urls", "prompt"],
        "bytedance/seedream/v5/lite/edit": ["image_size", "image_urls", "prompt"],
        "openai/gpt-image-2/edit": ["image_size", "image_urls", "prompt", "quality"],
      };
      expect(Object.keys(body ?? {}).sort()).toEqual(keys[id]);
      if (body && "aspect_ratio" in body) expect(body.aspect_ratio).toBe("2:3");
      if (body && "image_size" in body) expect(body.image_size).toEqual({ width: 1024, height: 1536 });
      expect(body?.image_urls).toEqual(["https://cdn.example/selfie.png", "https://cdn.example/reference.jpg"]);
      expect(body?.prompt).toBe(FAL_NUMBERED_IMAGE_PROMPT);
      expect(body?.quality).toBe(id === "openai/gpt-image-2/edit" ? "medium" : undefined);
      const quote = quoteComparisonModel(id, 480, 640, portrait);
      expect(quote.ok, id).toBe(true);
      if (!quote.ok) continue;
      expect(quote.estimateUsd).toBeCloseTo(usd[id]!, 6);
      expect(quote.estimateInr).toBe(bufferedInr(usd[id]!));
      expect(quote.estimateInr).toBeLessThanOrEqual(30);
    }
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
    process.env.FAL_QUEUE_DEADLINE_MS = "0";
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
    if (!result.ok) expect(result.error).toBe("UNCERTAIN");
    const call = await prisma.aiCall.findFirst({ where: { tenantId: "fal-timeout" } });
    expect(call?.status).toBe("UNCERTAIN");
    expect(call?.charged).toBe(true);
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
      const path = href.split("?")[0] || href;
      if (path.endsWith("/status")) return json({ status: "COMPLETED" });
      if (href.includes("/requests/req-black") && !path.endsWith("/status")) {
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

  it("polls the status_url fal returned when it differs from the full endpoint path", async () => {
    const seen: string[] = [];
    const logs: unknown[][] = [];
    const info = console.info;
    console.info = (...args: unknown[]) => {
      logs.push(args);
    };
    const color = await sharp({ create: { width: 12, height: 18, channels: 3, background: "#886655" } }).png().toBuffer();
    let tick = 0;
    const now = () => {
      tick += 500;
      return tick;
    };
    let polls = 0;
    let posted: { aspect_ratio?: string } = {};
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      seen.push(href);
      if (href.includes("/storage/upload/initiate")) {
        return json({ upload_url: "https://upload.example/put", file_url: "https://v3.fal.media/files/in.png" });
      }
      if (href.startsWith("https://upload.example")) return new Response(null, { status: 200 });
      if (href.startsWith("https://queue.fal.run/") && !href.includes("/requests/") && init?.method === "POST") {
        posted = JSON.parse(String(init.body)) as { aspect_ratio?: string };
        return json({
          request_id: "req-nested",
          status_url: "https://queue.fal.run/blackforestlabs/flux-3/requests/req-nested/status",
          response_url: "https://queue.fal.run/blackforestlabs/flux-3/requests/req-nested/response",
        });
      }
      if (href.startsWith("https://queue.fal.run/blackforestlabs/flux-3/requests/req-nested/status")) {
        polls += 1;
        if (polls === 1) return json({ status: "IN_QUEUE", queue_position: 1 });
        if (polls === 2) return json({ status: "IN_PROGRESS", logs: [{ message: "editing" }] });
        return json({
          status: "COMPLETED",
          response_url: "https://queue.fal.run/blackforestlabs/flux-3/requests/req-nested/response",
        });
      }
      if (href === "https://queue.fal.run/blackforestlabs/flux-3/requests/req-nested/response") {
        return json({ images: [{ url: "https://v3.fal.media/files/out.png", width: 12, height: 18 }] });
      }
      if (href.startsWith("https://v3.fal.media/")) return new Response(new Uint8Array(color), { status: 200 });
      throw new Error(`unexpected ${href}`);
    }) as typeof fetch;
    try {
      const result = await postFalReferenceEdit({
        apiKey: "fal-test-key-123456",
        endpointId: "blackforestlabs/flux-3/edit-image",
        prompt: FAL_NUMBERED_IMAGE_PROMPT,
        selfiePng: color,
        referenceJpeg: color,
        size: "1024x1536",
        estimateUsd: 0.05,
      fetchImpl,
      now,
      deadlineMs: 30_000,
      sleep: async () => undefined,
    });
      expect(posted.aspect_ratio).toBe("2:3");
      expect(result.requestId).toBe("req-nested");
      expect(result.outputSize).toBe("12x18");
      expect(polls).toBe(3);
      expect(seen.some((href) => href.includes("/edit-image/requests/"))).toBe(false);
      expect(seen.some((href) => href.startsWith("https://queue.fal.run/blackforestlabs/flux-3/requests/req-nested/status?logs=1"))).toBe(true);
      expect(logs.some((args) => args[0] === "fal queue submit" && (args[1] as { requestId?: string }).requestId === "req-nested")).toBe(true);
    } finally {
      console.info = info;
    }

    let submits = 0;
    let errorTick = 0;
    const failing = (async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("/storage/upload/initiate")) return json({ upload_url: "https://upload.example/put", file_url: "https://v3.fal.media/files/in.png" });
      if (href.startsWith("https://upload.example")) return new Response(null, { status: 200 });
      if (href.startsWith("https://queue.fal.run/") && !href.includes("/requests/") && init?.method === "POST") {
        submits += 1;
        return json({
          request_id: "req-err",
          status_url: "https://queue.fal.run/blackforestlabs/flux-3/requests/req-err/status",
        });
      }
      if (href.includes("/requests/req-err/status")) {
        return json({ status: "COMPLETED", error: "content checker rejected the frame", error_type: "content_policy_violation", logs: [{ message: "blocked" }] });
      }
      throw new Error(`unexpected ${href}`);
    }) as typeof fetch;
    await expect(postFalReferenceEdit({
      apiKey: "fal-test-key-123456",
      endpointId: "blackforestlabs/flux-3/edit-image",
      prompt: "edit",
      selfiePng: color,
      referenceJpeg: color,
      size: "1024x1536",
      estimateUsd: 0.05,
      fetchImpl: failing,
      now: () => {
        errorTick += 500;
        return errorTick;
      },
      deadlineMs: 30_000,
      sleep: async () => undefined,
    })).rejects.toThrow(/content checker rejected the frame/);
    expect(submits).toBe(1);
  });
});
