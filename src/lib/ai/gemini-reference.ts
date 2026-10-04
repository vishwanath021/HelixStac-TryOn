import { GoogleGenAI, Modality } from "@google/genai";
import { comparisonModel } from "@/lib/ai/compare-models";
import { BilledProviderError, UnknownModelError } from "@/lib/ai/errors";
import type { UsageNumbers } from "@/lib/ai/tiers";

export type GeminiReferenceRequest = {
  model: string;
  parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }>;
};

/** Selfie, then the catalogue reference, then the same reference prompt. No mask. */
export function geminiReferenceParts(args: { model: string; prompt: string; selfiePng: Buffer; referenceJpeg: Buffer }): GeminiReferenceRequest {
  const row = comparisonModel(args.model);
  if (!row || row.provider !== "gemini") {
    throw new UnknownModelError(`${args.model} is not a configured Gemini comparison model. No other model was called.`);
  }
  return {
    model: row.id,
    parts: [
      { inlineData: { mimeType: "image/png", data: args.selfiePng.toString("base64") } },
      { inlineData: { mimeType: "image/jpeg", data: args.referenceJpeg.toString("base64") } },
      { text: args.prompt },
    ],
  };
}

/** One generateContent call. A missing model id is refused. Nothing is substituted. */
export async function postGeminiReferenceEdit(args: {
  apiKey: string;
  model: string;
  prompt: string;
  selfiePng: Buffer;
  referenceJpeg: Buffer;
}) {
  const request = geminiReferenceParts(args);
  const ai = new GoogleGenAI({ apiKey: args.apiKey });
  const response = await ai.models.generateContent({
    model: request.model,
    contents: [{ role: "user", parts: request.parts }],
    config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (/not found|NOT_FOUND|unknown model|is not supported|invalid model|model_not_found/i.test(message)) {
      throw new UnknownModelError(`${request.model} is not available on this key. No other model was called.`);
    }
    throw new Error("Gemini image edit failed");
  });
  const usageMeta = response.usageMetadata;
  const usage: UsageNumbers | undefined = usageMeta
    ? {
        inputTokens: usageMeta.promptTokenCount,
        outputTokens: usageMeta.candidatesTokenCount,
        totalTokens: usageMeta.totalTokenCount,
        thoughtTokens: usageMeta.thoughtsTokenCount,
      }
    : undefined;
  const data = response.data;
  if (!data) throw new BilledProviderError(0, usage);
  return { image: Buffer.from(data, "base64"), usage, model: request.model };
}
