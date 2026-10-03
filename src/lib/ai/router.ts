import { GeminiProvider } from "@/lib/ai/gemini";
import { MockProvider } from "@/lib/ai/mock";
import { OpenAIProvider, openAIImageModel, openAIQuality } from "@/lib/ai/openai";
import { ReplicateStubProvider } from "@/lib/ai/replicate";
import { beginPaidCall } from "@/lib/ai/spend";
import type { GenerateInput, GenerateOutput, ImageStyleProvider, PreviewQuality } from "@/lib/ai/types";
import { aiProviderName } from "@/lib/env";

function modelFor(provider: string, quality: PreviewQuality) {
  if (provider === "openai") return openAIImageModel();
  if (provider === "gemini") {
    return quality === "hd"
      ? process.env.GEMINI_MODEL_HD || "gemini-3.1-flash-image"
      : process.env.GEMINI_MODEL_STANDARD || "gemini-3.1-flash-lite-image";
  }
  return provider;
}

export type ProviderChoice = {
  name: string;
  apiKey?: string;
};

export function selectProvider(requested = aiProviderName(), apiKey?: string): ImageStyleProvider {
  if (requested === "gemini" && (apiKey || process.env.GEMINI_API_KEY)) return new GeminiProvider(apiKey || process.env.GEMINI_API_KEY);
  if (requested === "openai" && (apiKey || process.env.OPENAI_API_KEY)) return new OpenAIProvider(apiKey || process.env.OPENAI_API_KEY);
  if (requested === "replicate" && process.env.REPLICATE_API_TOKEN) return new ReplicateStubProvider("replicate");
  if (requested === "fal" && process.env.FAL_KEY) return new ReplicateStubProvider("fal");
  return new MockProvider();
}

export async function generateWithFailover(input: GenerateInput, choice?: ProviderChoice): Promise<GenerateOutput> {
  const primary = choice ? selectProvider(choice.name, choice.apiKey) : selectProvider();
  if (primary.name === "mock") {
    const result = await primary.generate(input);
    return { ...result, demoReason: "no-key", estimateInr: 0 };
  }
  const quality = primary.name === "openai" ? openAIQuality(input.quality) : input.quality;
  const gate = await beginPaidCall({
    provider: primary.name,
    quality,
    model: modelFor(primary.name, input.quality),
    tenantId: input.tenantId,
  });
  if (!gate.ok) {
    const result = await new MockProvider().generate(input);
    return { ...result, provider: "mock:spend-cap", demoReason: "spend-cap", estimateInr: 0 };
  }
  try {
    const result = await primary.generate(input);
    return { ...result, estimateInr: gate.estimateInr };
  } catch {
    const result = await new MockProvider().generate(input);
    return {
      ...result,
      provider: `${result.provider}:failover-from-${primary.name}`,
      demoReason: "failover",
      estimateInr: gate.estimateInr,
    };
  }
}
