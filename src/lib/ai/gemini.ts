import { GoogleGenAI, Modality } from "@google/genai";
import { BilledProviderError, UnknownModelError } from "@/lib/ai/errors";
import { styleReferenceFor } from "@/lib/ai/style-reference";
import { prepareTierInput, tierRequest, type UsageNumbers } from "@/lib/ai/tiers";
import type { GenerateInput, GenerateOutput, ImageStyleProvider } from "@/lib/ai/types";

export class GeminiProvider implements ImageStyleProvider {
  name = "gemini";

  constructor(private readonly apiKey = process.env.GEMINI_API_KEY || "") {}

  async health() {
    return Boolean(this.apiKey);
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const apiKey = this.apiKey;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    const spec = tierRequest("gemini", input.tier || "test");
    const prepared = await prepareTierInput(input.image, undefined, spec);
    const started = Date.now();
    const ai = new GoogleGenAI({ apiKey });
    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [
      { inlineData: { mimeType: "image/jpeg", data: prepared.image.toString("base64") } },
    ];
    const reference = styleReferenceFor(input, "gemini");
    if (reference) parts.push({ inlineData: { mimeType: "image/jpeg", data: reference.toString("base64") } });
    parts.push({ text: input.prompt });
    const response = await ai.models.generateContent({
      model: spec.model,
      contents: [{ role: "user", parts }],
      config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      if (/not found|NOT_FOUND|unknown model|is not supported|invalid model|model_not_found/i.test(message)) {
        throw new UnknownModelError();
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
    if (!data) throw new BilledProviderError(spec.estimateUsd, usage);
    return {
      image: Buffer.from(data, "base64"),
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
