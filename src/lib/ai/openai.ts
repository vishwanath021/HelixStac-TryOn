import { BilledProviderError, isUnknownModelResponse, UnknownModelError } from "@/lib/ai/errors";
import { styleReferenceFor } from "@/lib/ai/style-reference";
import { padImageAndMask, restoreSquareContent } from "@/lib/ai/square";
import { prepareTierInput, tierRequest, type UsageNumbers } from "@/lib/ai/tiers";
import type { GenerateInput, GenerateOutput, ImageStyleProvider, PreviewQuality } from "@/lib/ai/types";

export type OpenAIImageQuality = "low" | "medium" | "high";

export function openAIImageModel() {
  return process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
}

export function openAIQuality(preview: PreviewQuality): OpenAIImageQuality {
  const raw = (preview === "hd" ? process.env.OPENAI_IMAGE_QUALITY_HD : process.env.OPENAI_IMAGE_QUALITY) || (preview === "hd" ? "high" : "medium");
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return preview === "hd" ? "high" : "medium";
}

function inputFidelity(model: string) {
  if (model.includes("gpt-image-1-mini")) return "low";
  if (model === "gpt-image-1" || model.startsWith("gpt-image-1.5")) return "high";
  return "";
}

function scrub(body: string) {
  return body
    .slice(0, 180)
    .replace(/sk-[A-Za-z0-9_\-]{8,}/g, "[redacted]")
    .replace(/AIza[0-9A-Za-z\-_]{8,}/g, "[redacted]")
    .replace(/[A-Za-z0-9+/=]{40,}/g, "[redacted]");
}

function usageFromPayload(payload: {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { text_tokens?: number; image_tokens?: number };
  };
}): UsageNumbers | undefined {
  const usage = payload.usage;
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
    textTokens: usage.input_tokens_details?.text_tokens,
    imageTokens: usage.input_tokens_details?.image_tokens,
  };
}

export class OpenAIProvider implements ImageStyleProvider {
  name = "openai";

  constructor(private readonly apiKey = process.env.OPENAI_API_KEY || "") {}

  async health() {
    return Boolean(this.apiKey);
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const apiKey = this.apiKey;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    const spec = tierRequest("openai", input.tier || "test");
    const prepared = await prepareTierInput(input.image, input.maskPng, spec);
    const padded = await padImageAndMask(prepared.image, prepared.mask);
    const started = Date.now();
    const form = new FormData();
    form.set("model", spec.model);
    form.set("prompt", input.prompt.slice(0, 32000));
    form.set("quality", spec.openaiQuality);
    form.set("size", spec.size);
    form.set("output_format", "jpeg");
    form.set("n", "1");
    const fidelity = inputFidelity(spec.model);
    if (fidelity) form.set("input_fidelity", fidelity);
    form.append("image[]", new Blob([new Uint8Array(padded.image)], { type: "image/jpeg" }), "selfie.jpg");
    const reference = styleReferenceFor(input, "openai");
    if (reference) {
      form.append("image[]", new Blob([new Uint8Array(reference)], { type: "image/jpeg" }), "style-reference.jpg");
    }
    if (padded.mask) {
      form.append("mask", new Blob([new Uint8Array(padded.mask)], { type: "image/png" }), "mask.png");
    }
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(55_000),
    });
    if (!response.ok) {
      const body = await response.text();
      if (isUnknownModelResponse(response.status, body)) throw new UnknownModelError();
      throw new Error(`OpenAI image edit failed (${response.status}) ${scrub(body)}`);
    }
    const payload = (await response.json()) as {
      data?: { b64_json?: string }[];
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        input_tokens_details?: { text_tokens?: number; image_tokens?: number };
      };
    };
    const usage = usageFromPayload(payload);
    const b64 = payload.data?.[0]?.b64_json;
    if (!b64) throw new BilledProviderError(spec.estimateUsd, usage);
    const image = await restoreSquareContent(Buffer.from(b64, "base64"), padded);
    return {
      image,
      mime: "image/jpeg",
      provider: `${this.name}:${spec.model}:${spec.quality}`,
      providerCostUsd: spec.estimateUsd,
      latencyMs: Date.now() - started,
      estimateInr: spec.estimateInr,
      model: spec.model,
      qualityTier: spec.quality,
      imageSize: spec.size,
      usage,
      costSource: usage ? "usage" : "estimate",
    };
  }
}
