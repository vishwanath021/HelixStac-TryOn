import sharp from "sharp";
import { numberEnv } from "@/lib/env";
import type { GenerateInput, GenerateOutput, ImageStyleProvider, PreviewQuality } from "@/lib/ai/types";

export type OpenAIImageQuality = "low" | "medium" | "high";

const USD: Record<OpenAIImageQuality, number> = {
  low: 0.016,
  medium: 0.063,
  high: 0.25,
};

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

export class OpenAIProvider implements ImageStyleProvider {
  name = "openai";

  async health() {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    const model = openAIImageModel();
    const quality = openAIQuality(input.quality);
    const started = Date.now();
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", input.prompt.slice(0, 32000));
    form.set("quality", quality);
    form.set("size", process.env.OPENAI_IMAGE_SIZE || "1024x1536");
    form.set("output_format", "jpeg");
    form.set("n", "1");
    const fidelity = inputFidelity(model);
    if (fidelity) form.set("input_fidelity", fidelity);
    form.append("image[]", new Blob([new Uint8Array(input.image)], { type: "image/jpeg" }), "selfie.jpg");
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(55_000),
    });
    if (!response.ok) {
      const brief = (await response.text()).slice(0, 180).replace(/[A-Za-z0-9+/=]{40,}/g, "[redacted]");
      throw new Error(`OpenAI image edit failed (${response.status}) ${brief}`);
    }
    const payload = (await response.json()) as { data?: { b64_json?: string }[] };
    const b64 = payload.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI returned no image");
    const image = await sharp(Buffer.from(b64, "base64")).rotate().jpeg({ quality: 86 }).toBuffer();
    const fx = numberEnv("FX_INR_PER_USD", 96);
    return {
      image,
      mime: "image/jpeg",
      provider: `${this.name}:${model}:${quality}`,
      providerCostUsd: USD[quality],
      latencyMs: Date.now() - started,
      estimateInr: Math.round(USD[quality] * fx * 1.08 * 10) / 10,
    };
  }
}
