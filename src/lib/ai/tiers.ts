import sharp from "sharp";
import { PLANS, type PlanId } from "@/data/plans";
import { numberEnv } from "@/lib/env";

export type ModelTier = "test" | "medium" | "high";
export type ImageProviderName = "openai" | "gemini";

export type UsageNumbers = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  textTokens?: number;
  imageTokens?: number;
  thoughtTokens?: number;
};

export type TierRequest = {
  tier: ModelTier;
  provider: ImageProviderName;
  model: string;
  /** Value stored and shown. OpenAI also sends this as the quality parameter. */
  quality: string;
  openaiQuality: "low" | "medium" | "high";
  size: "1024x1024";
  /** Long side of the photo sent to the provider. 0 keeps the sanitized photo. */
  inputLongSide: number;
  /** List price in USD for one 1024 image, before the INR buffer. */
  estimateUsd: number;
  /** INR counted against AI_SPEND_CAP_INR. ₹/USD × 1.08, rounded up to ₹0.1. */
  estimateInr: number;
};

const TIERS: ModelTier[] = ["test", "medium", "high"];

export function parseTier(value: string | null | undefined): ModelTier {
  if (value === "medium" || value === "high" || value === "test") return value;
  return "test";
}

export function isModelTier(value: string): value is ModelTier {
  return value === "test" || value === "medium" || value === "high";
}

function envModel(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

/** Buffered INR estimate. Not a provider invoice. */
export function bufferedInr(usd: number) {
  const raw = usd * numberEnv("FX_INR_PER_USD", 96) * 1.08;
  return Math.ceil(raw * 10 - 1e-9) / 10;
}

/** INR from a USD amount at FX_INR_PER_USD, with no retry buffer. */
export function exactInr(usd: number) {
  return Math.round(usd * numberEnv("FX_INR_PER_USD", 96) * 100) / 100;
}

function inrOverride(provider: string, tier: ModelTier, computed: number) {
  const specific = process.env[`AI_COST_PER_CALL_INR_${provider.toUpperCase()}_${tier.toUpperCase()}`];
  if (specific !== undefined && specific !== "" && Number.isFinite(Number(specific))) return Math.max(0, Number(specific));
  return computed;
}

function openAiListUsd(model: string, quality: "low" | "medium" | "high") {
  const mini = model.includes("gpt-image-1-mini");
  const table = mini
    ? { low: 0.005, medium: 0.011, high: 0.036 }
    : { low: 0.011, medium: 0.042, high: 0.167 };
  return table[quality];
}

/**
 * Model, quality, size, and INR estimate for one tier.
 * Prices checked 3 Oct 2026: gpt-image-1-mini and gpt-image-1 at 1024x1024,
 * and Gemini 3.1 Flash Lite / Flash image at 1K (1120 output tokens).
 */
export function tierRequest(provider: ImageProviderName, tier: ModelTier): TierRequest {
  if (provider === "openai") {
    if (tier === "test") {
      const model = envModel("OPENAI_IMAGE_MODEL_TEST", "gpt-image-1-mini");
      const estimateUsd = openAiListUsd(model, "low");
      return { tier, provider, model, quality: "low", openaiQuality: "low", size: "1024x1024", inputLongSide: 768, estimateUsd, estimateInr: inrOverride(provider, tier, bufferedInr(estimateUsd)) };
    }
    if (tier === "medium") {
      const model = envModel("OPENAI_IMAGE_MODEL_MEDIUM", "gpt-image-1-mini");
      const estimateUsd = openAiListUsd(model, "medium");
      return { tier, provider, model, quality: "medium", openaiQuality: "medium", size: "1024x1024", inputLongSide: 0, estimateUsd, estimateInr: inrOverride(provider, tier, bufferedInr(estimateUsd)) };
    }
    const model = envModel("OPENAI_IMAGE_MODEL_HIGH", "gpt-image-1");
    const estimateUsd = openAiListUsd(model, "high");
    return { tier, provider, model, quality: "high", openaiQuality: "high", size: "1024x1024", inputLongSide: 0, estimateUsd, estimateInr: inrOverride(provider, tier, bufferedInr(estimateUsd)) };
  }
  if (tier === "test") {
    const model = envModel("GEMINI_MODEL_STANDARD", "gemini-3.1-flash-lite-image");
    const estimateUsd = 0.0336;
    return { tier, provider, model, quality: "lite", openaiQuality: "low", size: "1024x1024", inputLongSide: 768, estimateUsd, estimateInr: inrOverride(provider, tier, bufferedInr(estimateUsd)) };
  }
  if (tier === "medium") {
    const model = envModel("GEMINI_MODEL_MEDIUM", "gemini-3.1-flash-image");
    const estimateUsd = 0.067;
    return { tier, provider, model, quality: "1K", openaiQuality: "medium", size: "1024x1024", inputLongSide: 0, estimateUsd, estimateInr: inrOverride(provider, tier, bufferedInr(estimateUsd)) };
  }
  const model = envModel("GEMINI_MODEL_HD", "gemini-3.1-flash-image");
  const estimateUsd = 0.067;
  return { tier, provider, model, quality: "HD", openaiQuality: "high", size: "1024x1024", inputLongSide: 0, estimateUsd, estimateInr: inrOverride(provider, tier, bufferedInr(estimateUsd)) };
}

export function tierCatalog(provider: ImageProviderName): TierRequest[] {
  return TIERS.map((tier) => tierRequest(provider, tier));
}

export function resolveGuestTier(args: {
  stored: ModelTier;
  highEnabled: boolean;
  mediumApproved: boolean;
  purpose: "guest" | "calibration";
}): ModelTier {
  if (args.purpose === "calibration") return "test";
  if (args.stored === "high") {
    if (!args.highEnabled) return args.mediumApproved ? "medium" : "test";
    return "high";
  }
  if (args.stored === "medium") return args.mediumApproved ? "medium" : "test";
  return "test";
}

type TokenRates = { textIn: number; imageIn: number; imageOut: number; textOut: number };

function tokenRates(model: string): TokenRates | null {
  if (model === "gpt-image-1-mini") return { textIn: 2, imageIn: 2.5, imageOut: 8, textOut: 8 };
  if (model === "gpt-image-1.5") return { textIn: 5, imageIn: 8, imageOut: 32, textOut: 32 };
  if (model === "gpt-image-1") return { textIn: 5, imageIn: 10, imageOut: 40, textOut: 40 };
  // Exact id. Guide checked 4 Oct 2026: image output $30/1M, text input $5/1M, image input $8/1M.
  if (model === "gpt-image-2") return { textIn: 5, imageIn: 8, imageOut: 30, textOut: 30 };
  // Exact ids. Model pages checked 4 Oct 2026: image input $8/1M, image output $30/1M, text input $5/1M. Text output is not billed.
  if (model === "gpt-image-2.5-sunburst" || model === "gpt-image-2.5-flare") return { textIn: 5, imageIn: 8, imageOut: 30, textOut: 0 };
  if (model === "gemini-3.1-flash-image") return { textIn: 0.5, imageIn: 0.5, imageOut: 60, textOut: 3 };
  if (model.includes("flash-lite-image")) return { textIn: 0.25, imageIn: 0.25, imageOut: 30, textOut: 1.5 };
  if (model.includes("flash-image")) return { textIn: 0.5, imageIn: 0.5, imageOut: 60, textOut: 3 };
  return null;
}

/** USD from token usage. Null when the response has no usable counts or the model has no rate table. */
export function costUsdFromUsage(model: string, usage: UsageNumbers | undefined): number | null {
  if (!usage) return null;
  const rates = tokenRates(model);
  if (!rates) return null;
  const output = usage.outputTokens ?? 0;
  const thoughts = usage.thoughtTokens ?? 0;
  if (model.includes("flash")) {
    const input = usage.inputTokens ?? 0;
    if (output <= 0 && input <= 0 && thoughts <= 0) return null;
    const usd = (input * rates.imageIn + thoughts * rates.textOut + output * rates.imageOut) / 1_000_000;
    return Math.round(usd * 1_000_000) / 1_000_000;
  }
  const textIn = usage.textTokens ?? 0;
  const imageIn = usage.imageTokens ?? Math.max(0, (usage.inputTokens ?? 0) - textIn);
  if (output <= 0 && imageIn <= 0 && textIn <= 0) return null;
  const usd = (textIn * rates.textIn + imageIn * rates.imageIn + output * rates.imageOut) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Same rates as costUsdFromUsage, for a quote that has not called the provider yet. */
export function usdFromTokenCounts(model: string, counts: { textIn: number; imageIn: number; output: number }): number | null {
  const rates = tokenRates(model);
  if (!rates) return null;
  const usd = (counts.textIn * rates.textIn + counts.imageIn * rates.imageIn + counts.output * rates.imageOut) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export function ledgerTool(kind?: string, colour?: string | null): "hair" | "colour" | "brows" | "beard" | "nails" {
  if (kind === "brows" || kind === "beard" || kind === "nails") return kind;
  return colour ? "colour" : "hair";
}

export async function prepareTierInput(image: Buffer, mask: Buffer | undefined, spec: Pick<TierRequest, "inputLongSide">) {
  const meta = await sharp(image, { failOn: "none" }).metadata();
  const long = Math.max(meta.width || 0, meta.height || 0);
  let next = image;
  if (spec.inputLongSide > 0 && long > spec.inputLongSide) {
    next = await sharp(image, { failOn: "none" })
      .rotate()
      .resize({ width: spec.inputLongSide, height: spec.inputLongSide, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86 })
      .toBuffer();
  }
  if (!mask) return { image: next, mask: undefined as Buffer | undefined };
  const sized = await sharp(next, { failOn: "none" }).metadata();
  const maskMeta = await sharp(mask, { failOn: "none" }).metadata();
  if (sized.width && sized.height && (maskMeta.width !== sized.width || maskMeta.height !== sized.height)) {
    const resized = await sharp(mask, { failOn: "none" }).resize(sized.width, sized.height, { fit: "fill", kernel: "nearest" }).png().toBuffer();
    return { image: next, mask: resized };
  }
  return { image: next, mask };
}

export function projectSalonMonth(avgInr: number, imagesPerMonth: number) {
  const images = Math.max(0, imagesPerMonth);
  const projectedInr = Math.round(avgInr * images * 100) / 100;
  return (["STARTER", "PRO", "CHAIN"] as PlanId[]).map((id) => ({
    id,
    name: id === "CHAIN" ? "Chain" : PLANS[id].name,
    priceInr: PLANS[id].monthlyExGst,
    projectedInr,
    marginInr: Math.round((PLANS[id].monthlyExGst - projectedInr) * 100) / 100,
  }));
}
