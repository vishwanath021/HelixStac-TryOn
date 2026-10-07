import { createElement } from "react";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { afterAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { POST as suggestPost } from "@/app/api/v1/tryon/suggest/route";
import { HairTypePicker } from "@/components/tryon/HairTypePicker";
import { STYLES, styleById, toPublicStyle } from "@/data/styles";
import { runHairSuggest } from "@/lib/ai/hair-suggest";
import { DEFAULT_SUGGEST_MODEL, resolveSuggestModel, suggestEstimateUsd } from "@/lib/ai/suggest-models";
import { orderStylesForPicker, suggestStyles } from "@/lib/hair-suitability";
import { bufferedInr, costUsdFromUsage } from "@/lib/ai/tiers";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
}));

const reading = {
  density: "thick",
  texture: "wavy",
  hairline: "medium",
  faceShape: "oval",
  confidence: 0.82,
};

describe("hairstyle suitability tags", () => {
  it("seeds density and texture on every style photo", () => {
    expect(STYLES.length).toBeGreaterThan(10);
    for (const style of STYLES) {
      expect(style.density.length).toBeGreaterThan(0);
      expect(style.texture.length).toBeGreaterThan(0);
      expect(style.density.every((item) => ["thin", "medium", "thick"].includes(item))).toBe(true);
      expect(style.texture.every((item) => ["straight", "wavy", "curly"].includes(item))).toBe(true);
    }
    expect(styleById("butterfly-layers")?.density).toEqual(["thick"]);
    expect(styleById("butterfly-layers")?.texture).toEqual(["straight", "wavy"]);
    expect(styleById("pixie")?.density).toEqual(["thin"]);
    expect(styleById("pixie")?.texture).toEqual(["straight", "wavy", "curly"]);
    expect(styleById("soft-bob")?.density).toEqual(["thin", "medium", "thick"]);
    expect(styleById("curtain-bangs")?.density).toEqual(["thick"]);
  });

  it("filters the menu to matching photos and can show the rest after them", () => {
    const women = STYLES.filter((style) => style.gender === "women").map(toPublicStyle);
    const curly = orderStylesForPicker(women, { density: "", texture: "curly" }, false);
    expect(curly.length).toBeGreaterThan(0);
    expect(curly.every((style) => style.texture.includes("curly"))).toBe(true);
    const all = orderStylesForPicker(women, { density: "thick", texture: "wavy" }, true);
    expect(all).toHaveLength(women.length);
    expect(all[0]?.density.includes("thick") && all[0]?.texture.includes("wavy")).toBe(true);
    const suggestions = suggestStyles(women, { density: "thick", texture: "wavy", faceShape: "oval" });
    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    expect(suggestions.length).toBeLessThanOrEqual(5);
    expect(suggestions[0]?.reason).toBe("Suits thick wavy hair");
    expect(suggestions.every((row) => row.style.id && row.reason.length > 0)).toBe(true);
  });
});

describe("suggestion model price", () => {
  it("defaults to gpt-4.1-nano and prices the reserved allowance from the listed token rates", () => {
    expect(DEFAULT_SUGGEST_MODEL).toBe("gpt-4.1-nano");
    expect(resolveSuggestModel(undefined)).toBe("gpt-4.1-nano");
    expect(resolveSuggestModel("gpt-4.1")).toBeNull();
    expect(resolveSuggestModel("gpt-4o-mini")).toBe("gpt-4o-mini");
    const dollars = suggestEstimateUsd("gpt-4.1-nano");
    expect(dollars).toBe(0.00032);
    expect(bufferedInr(dollars)).toBe(0.1);
    const actual = costUsdFromUsage("gpt-4.1-nano", { textTokens: 900, imageTokens: 0, outputTokens: 40, inputTokens: 900, totalTokens: 940 });
    expect(actual).toBe(0.000106);
  });
});

describe("mocked hair reading", () => {
  const slug = `suggest-${Date.now()}`;
  let tenantId = "";

  afterAll(async () => {
    if (!tenantId) return;
    await prisma.hairSuggest.deleteMany({ where: { tenantId } });
    await prisma.creditLedger.deleteMany({ where: { tenantId } });
    await prisma.consentLog.deleteMany({ where: { tenantId } });
    await prisma.aiCall.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  });

  it("sends the selfie once, caches the reading, and keeps a second click free", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug, name: "Suggest salon", creditBalance: 3, hairSuggestOn: true, hairSuggestUsesCredits: true },
    });
    tenantId = tenant.id;
    const jpeg = await sharp({ create: { width: 96, height: 128, channels: 3, background: { r: 40, g: 30, b: 24 } } }).jpeg().toBuffer();
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body || "") });
      return new Response(JSON.stringify({
        id: "chatcmpl-test",
        choices: [{ message: { content: JSON.stringify(reading) } }],
        usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const styles = STYLES.filter((style) => style.gender === "women").map(toPublicStyle);
    const first = await runHairSuggest({
      tenantId,
      photoHash: "photo-hash-1",
      imageJpeg: jpeg,
      styles,
      chargeCredits: true,
      apiKey: "test-key",
      model: "gpt-4.1-nano",
      fetchImpl,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.cached).toBe(false);
    expect(first.suggestions.length).toBeGreaterThanOrEqual(3);
    expect(first.suggestions.length).toBeLessThanOrEqual(5);
    expect(first.suggestions[0]?.reason).toBe("Suits thick wavy hair");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    const sent = JSON.parse(calls[0]?.body || "{}");
    expect(sent.model).toBe("gpt-4.1-nano");
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(sent.messages[0].content.some((part: { type?: string }) => part.type === "image_url")).toBe(true);
    const row = await prisma.aiCall.findFirst({ where: { tenantId, tool: "suggest" } });
    expect(row?.costSource).toBe("usage");
    expect(row?.estimatePaise).toBe(10);
    expect(row?.costInrPaise).toBe(1);
    expect(row?.charged).toBe(true);
    expect(row?.model).toBe("gpt-4.1-nano");
    const balance = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(balance.creditBalance).toBe(2);

    const second = await runHairSuggest({
      tenantId,
      photoHash: "photo-hash-1",
      imageJpeg: jpeg,
      styles,
      chargeCredits: true,
      apiKey: "test-key",
      model: "gpt-4.1-nano",
      fetchImpl,
    });
    expect(second.ok && second.cached).toBe(true);
    expect(calls).toHaveLength(1);
    expect(await prisma.aiCall.count({ where: { tenantId, tool: "suggest" } })).toBe(1);
    const after = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(after.creditBalance).toBe(2);
  });

  it("does not call the provider when the spend cap is already reached", async () => {
    process.env.AI_SPEND_CAP_INR = "0";
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response("{}", { status: 500 });
    }) as typeof fetch;
    const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 10, b: 10 } } }).jpeg().toBuffer();
    let result: Awaited<ReturnType<typeof runHairSuggest>>;
    try {
      result = await runHairSuggest({
        tenantId,
        photoHash: "photo-hash-cap",
        imageJpeg: jpeg,
        styles: STYLES.slice(0, 3).map(toPublicStyle),
        chargeCredits: false,
        apiKey: "test-key",
        model: "gpt-4.1-nano",
        fetchImpl,
      });
    } finally {
      delete process.env.AI_SPEND_CAP_INR;
    }
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("SPEND_CAP");
    expect(calls).toEqual([]);
  });

  it("does not retry when the vision body is unusable", async () => {
    const calls: string[] = [];
    const fetchImpl = (async () => {
      calls.push("once");
      return new Response(JSON.stringify({
        id: "chatcmpl-bad",
        choices: [{ message: { content: "not-json" } }],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      }), { status: 200 });
    }) as typeof fetch;
    const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 12, g: 12, b: 12 } } }).jpeg().toBuffer();
    const result = await runHairSuggest({
      tenantId,
      photoHash: "photo-hash-bad",
      imageJpeg: jpeg,
      styles: STYLES.slice(0, 3).map(toPublicStyle),
      chargeCredits: false,
      apiKey: "test-key",
      model: "gpt-4.1-nano",
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    expect(calls).toEqual(["once"]);
    expect(await prisma.hairSuggest.findFirst({ where: { tenantId, photoHash: "photo-hash-bad" } })).toBeNull();
  });

  it("refuses a turned-off salon and an unknown model before any provider call", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      seen.push(String(url));
      return new Response("{}", { status: 500 });
    }) as typeof fetch;
    const off = await prisma.tenant.create({ data: { slug: `${slug}-off`, name: "Off salon", hairSuggestOn: false } });
    const form = new FormData();
    form.set("slug", off.slug);
    form.set("sessionId", "session-1234");
    form.set("consentId", "missing");
    form.set("gender", "women");
    form.set("photo", new File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" }));
    const refused = await suggestPost(new Request("http://localhost/api/v1/tryon/suggest", { method: "POST", body: form }));
    expect(refused.status).toBe(403);
    process.env.SUGGEST_MODEL = "gpt-4.1";
    await prisma.tenant.update({ where: { id: tenantId }, data: { hairSuggestOn: true } });
    await prisma.consentLog.create({
      data: {
        tenantId,
        sessionId: "session-1234",
        purpose: "tryon",
        textVersion: "2026-10-03",
        textHash: "abc",
        lang: "en",
        accepted: true,
        ageGate: true,
      },
    });
    const paid = new FormData();
    paid.set("slug", slug);
    paid.set("sessionId", "session-1234");
    paid.set("consentId", (await prisma.consentLog.findFirstOrThrow({ where: { tenantId } })).id);
    paid.set("gender", "women");
    paid.set("photo", new File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" }));
    const unknown = await suggestPost(new Request("http://localhost/api/v1/tryon/suggest", { method: "POST", body: paid }));
    delete process.env.SUGGEST_MODEL;
    globalThis.fetch = original;
    expect(unknown.status).toBe(400);
    const unknownBody = await unknown.json();
    expect(unknownBody.error).toBe("MODEL");
    expect(seen).toEqual([]);
    await prisma.tenant.delete({ where: { id: off.id } });
  });
});

describe("hair picker markup", () => {
  it("shows style photos and keeps the paid button off until the salon enables it", () => {
    const card = {
      id: "pixie",
      name: "Pixie",
      reason: "Suits thick wavy hair",
      serviceKeys: ["haircut"],
    };
    const free = renderToStaticMarkup(createElement(HairTypePicker, {
      pickerOn: true,
      suggestOn: false,
      usesCredits: false,
      density: "thick",
      texture: "",
      showAll: false,
      suggestions: [card],
      selectedId: "",
      busy: false,
      note: "",
      costLine: "",
      onDensity: () => undefined,
      onTexture: () => undefined,
      onShowAll: () => undefined,
      onSuggest: () => undefined,
      onPick: () => undefined,
    }));
    expect(free).toContain("Hair type");
    expect(free).toContain("Show all");
    expect(free).toContain("Suggested for you");
    expect(free).toContain("Suits thick wavy hair");
    expect(free).toContain("/styles/pixie.jpg");
    expect(free).not.toContain("Get AI suggestions");
    const guest = readFileSync("src/components/tryon/TryOnApp.tsx", "utf8");
    expect(guest).not.toContain("gpt-4.1");
    expect(guest).not.toMatch(/estimateInr|costUsd/);
  });
});
