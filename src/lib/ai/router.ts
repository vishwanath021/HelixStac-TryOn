import { aiProviderName } from "@/lib/env";
import { GeminiProvider } from "@/lib/ai/gemini";
import { MockProvider } from "@/lib/ai/mock";
import { ReplicateStubProvider } from "@/lib/ai/replicate";
import type { GenerateInput, GenerateOutput, ImageStyleProvider } from "@/lib/ai/types";

export function selectProvider(requested = aiProviderName()): ImageStyleProvider {
  if (requested === "gemini" && process.env.GEMINI_API_KEY) return new GeminiProvider();
  if (requested === "replicate" && process.env.REPLICATE_API_TOKEN) return new ReplicateStubProvider("replicate");
  if (requested === "fal" && process.env.FAL_KEY) return new ReplicateStubProvider("fal");
  return new MockProvider();
}

export async function generateWithFailover(input: GenerateInput): Promise<GenerateOutput> {
  const primary = selectProvider();
  try {
    return await primary.generate(input);
  } catch (error) {
    if (primary.name === "mock") throw error;
    const fallback = new MockProvider();
    const result = await fallback.generate(input);
    return { ...result, provider: `${result.provider}:failover-from-${primary.name}` };
  }
}
