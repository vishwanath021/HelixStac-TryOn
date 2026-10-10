import { benchmarkRunCapInr, estimateImageInputTokens, mediumOutputTokenAllowance } from "@/lib/ai/benchmark";
import { editSizeForAspect, type EditSize } from "@/lib/ai/edit-request";
import { bufferedInr, exactInr } from "@/lib/ai/tiers";

/**
 * OpenRouter chat models that accept image input and return image and text.
 * Checked 4 Oct 2026 against GET /api/v1/models?output_modalities=image and each model page.
 * Match the full id. A prefix is not a model.
 *
 * These rows are called with POST /api/v1/chat/completions and modalities ["image","text"].
 * Models whose output is image only (gpt-image-2, the 2.5 image ids, Flux, Seedream) are on the Image API
 * and are not in this list. openrouter/auto and openrouter/auto-beta are routers and are not in this list.
 * Preview slugs of the same Gemini image models are listed on the catalog and are not in this list.
 * OpenRouter does not list fal-ai endpoints. It does not proxy fal.ai.
 */
const OUTPUT_SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;

export type OpenRouterPrice = {
  /** USD per million tokens. */
  imageIn: number;
  textIn: number;
  imageOut: number;
  textOut: number;
};

export type OpenRouterModelRow = {
  id: string;
  label: string;
  /** Documented maximum reference images. Two are sent. */
  maxInputs: number;
  /** google uses the 1K token count. openai-edit uses the direct-edit token allowance. */
  quote: "gemini-1k" | "openai-edit";
  /** Measured chat high from the 11 Sep 2026 OpenRouter blog, in USD. 0 means the page did not publish one. */
  measuredChatHighUsd: number;
  price: OpenRouterPrice;
};

const GEMINI_IMAGE_TOKENS = 1120;
const TEXT_IN = 400;
const TEXT_OUT = 200;

export const OPENROUTER_COMPARISON_MODELS: readonly OpenRouterModelRow[] = [
  {
    id: "google/gemini-2.5-flash-image",
    label: "google/gemini-2.5-flash-image",
    maxInputs: 3,
    quote: "gemini-1k",
    measuredChatHighUsd: 0,
    price: { imageIn: 0.3, textIn: 0.3, imageOut: 30, textOut: 2.5 },
  },
  {
    id: "google/gemini-3.1-flash-lite-image",
    label: "google/gemini-3.1-flash-lite-image",
    maxInputs: 14,
    quote: "gemini-1k",
    measuredChatHighUsd: 0,
    price: { imageIn: 0.25, textIn: 0.25, imageOut: 30, textOut: 1.5 },
  },
  {
    id: "google/gemini-3.1-flash-image",
    label: "google/gemini-3.1-flash-image",
    maxInputs: 14,
    quote: "gemini-1k",
    measuredChatHighUsd: 0,
    price: { imageIn: 0.5, textIn: 0.5, imageOut: 60, textOut: 3 },
  },
  {
    id: "google/gemini-3-pro-image",
    label: "google/gemini-3-pro-image",
    maxInputs: 14,
    quote: "gemini-1k",
    measuredChatHighUsd: 0,
    price: { imageIn: 2, textIn: 2, imageOut: 120, textOut: 12 },
  },
  {
    id: "openai/gpt-5-image-mini",
    label: "openai/gpt-5-image-mini",
    maxInputs: 16,
    quote: "openai-edit",
    measuredChatHighUsd: 0,
    price: { imageIn: 2.5, textIn: 2.5, imageOut: 8, textOut: 2 },
  },
  {
    id: "openai/gpt-5.4-image-2",
    label: "openai/gpt-5.4-image-2",
    maxInputs: 16,
    quote: "openai-edit",
    measuredChatHighUsd: 0,
    price: { imageIn: 8, textIn: 8, imageOut: 30, textOut: 15 },
  },
  {
    id: "openai/gpt-5-image",
    label: "openai/gpt-5-image",
    maxInputs: 16,
    quote: "openai-edit",
    measuredChatHighUsd: 0.28,
    price: { imageIn: 10, textIn: 10, imageOut: 40, textOut: 10 },
  },
];

export function openRouterModel(id: string) {
  return OPENROUTER_COMPARISON_MODELS.find((row) => row.id === id) ?? null;
}

export function openRouterAspect(width: number, height: number) {
  const size = editSizeForAspect(width, height, OUTPUT_SIZES);
  if (size === "1024x1536") return "2:3" as const;
  if (size === "1536x1024") return "3:2" as const;
  return "1:1" as const;
}

function portraitSize(width: number, height: number): EditSize {
  return editSizeForAspect(width, height, OUTPUT_SIZES);
}

function usdFromRates(price: OpenRouterPrice, counts: { imageIn: number; textIn: number; imageOut: number; textOut: number }) {
  return (
    counts.imageIn * price.imageIn +
    counts.textIn * price.textIn +
    counts.imageOut * price.imageOut +
    counts.textOut * price.textOut
  ) / 1_000_000;
}

export function quoteOpenRouterModel(id: string, width: number, height: number, reference = { width: 512, height: 512 }) {
  const row = openRouterModel(id);
  if (!row) return { ok: false as const, message: `${id} is not a configured comparison model. No other model was substituted.` };
  if (row.maxInputs < 2) {
    return { ok: false as const, message: `${row.id} does not accept two images. The request was not sent.` };
  }
  const aspect = openRouterAspect(width, height);
  const size = portraitSize(width, height);
  let detail = "";
  let estimateUsd = 0;
  if (row.quote === "gemini-1k") {
    estimateUsd = usdFromRates(row.price, {
      imageIn: GEMINI_IMAGE_TOKENS * 2,
      textIn: TEXT_IN,
      imageOut: GEMINI_IMAGE_TOKENS,
      textOut: TEXT_OUT,
    });
    detail = `Model page rates: image input $${row.price.imageIn}/1M, text input $${row.price.textIn}/1M, image output $${row.price.imageOut}/1M, text output $${row.price.textOut}/1M. The 11 Sep 2026 OpenRouter measurements divide into 1,120 tokens for a 1K image. This quote uses 1,120 tokens for each of the two input images, 1,120 for one output image, 400 text-input tokens, and 200 text-output tokens.`;
  } else {
    const imageIn = estimateImageInputTokens(Math.max(1, width) * Math.max(1, height), Math.max(1, reference.width) * Math.max(1, reference.height));
    const imageOut = mediumOutputTokenAllowance(size);
    estimateUsd = usdFromRates(row.price, { imageIn, textIn: TEXT_IN, imageOut, textOut: TEXT_OUT });
    detail = `Model page rates: image input $${row.price.imageIn}/1M, text input $${row.price.textIn}/1M, image output $${row.price.imageOut}/1M, text output $${row.price.textOut}/1M. The chat path does not publish an image-token count. Image-input tokens use the 1536×1024 calibration with a 15% margin. Output tokens use the medium ${size} guide allowance. Text allowances are 400 in and 200 out.`;
    if (row.measuredChatHighUsd > 0) {
      estimateUsd = Math.max(estimateUsd, row.measuredChatHighUsd);
      detail += ` The 11 Sep 2026 blog measured $${row.measuredChatHighUsd.toFixed(2)} on a text-and-image chat for this id. That run did not say two reference images were sent. The quote uses the higher of that figure and the token allowance.`;
    }
  }
  const estimateInr = bufferedInr(estimateUsd);
  const capInr = benchmarkRunCapInr();
  if (estimateInr > capInr) {
    return {
      ok: false as const,
      message: `This comparison is about ₹${estimateInr.toFixed(2)}, above the ₹${capInr.toFixed(0)} run cap. It was not sent.`,
    };
  }
  return {
    ok: true as const,
    provider: "openrouter" as const,
    model: row.id,
    quality: "chat",
    size: aspect,
    outputFormat: "png" as const,
    inputFidelity: null,
    n: 1 as const,
    estimateUsd,
    estimateInr,
    capInr,
    outputTokens: 0,
    outputUsd: estimateUsd,
    imageInputTokens: 0,
    imageInputUsd: 0,
    textInputTokens: TEXT_IN,
    textInputUsd: 0,
    inputSizeMode: "native" as const,
    rangeLowInr: exactInr(estimateUsd),
    rangeHighInr: exactInr(estimateUsd),
    note: `Estimate about ₹${exactInr(estimateUsd).toFixed(2)} at FX 96 before the 8% buffer. The ₹${capInr.toFixed(0)} cap uses ₹${estimateInr.toFixed(2)} after that buffer until an actual is known. ${detail} A finished call uses usage.cost when OpenRouter returns it, otherwise total_cost from GET /api/v1/generation. Not an invoice. OpenRouter does not proxy fal.ai.`,
  };
}

/** One chat completion. models has a single id. allow_fallbacks is false. route is omitted. */
export function buildOpenRouterChatBody(id: string, args: { prompt: string; selfieDataUrl: string; referenceDataUrl: string; aspectRatio: string }) {
  const row = openRouterModel(id);
  if (!row) return null;
  return {
    model: row.id,
    models: [row.id],
    modalities: ["image", "text"],
    provider: { allow_fallbacks: false },
    image_config: { aspect_ratio: args.aspectRatio },
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: args.prompt },
          { type: "image_url" as const, image_url: { url: args.selfieDataUrl } },
          { type: "image_url" as const, image_url: { url: args.referenceDataUrl } },
        ],
      },
    ],
  };
}
