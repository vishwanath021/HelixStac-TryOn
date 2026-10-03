import { GeminiProvider } from "@/lib/ai/gemini";
import { MockProvider } from "@/lib/ai/mock";
import { OpenAIProvider, openAIImageModel, openAIQuality } from "@/lib/ai/openai";
import { ReplicateStubProvider } from "@/lib/ai/replicate";
import { beginPaidCall, releasePaidCall } from "@/lib/ai/spend";
import type { GenerateInput, GenerateOutput, ImageStyleProvider, PreviewQuality } from "@/lib/ai/types";
import { runLockedEdit } from "@/lib/face/pipeline";
import { preflightPhoto, type RegionTool } from "@/lib/face/region";
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

function regionOf(input: GenerateInput): RegionTool {
  if (input.kind === "brows" || input.kind === "beard" || input.kind === "nails") return input.kind;
  return input.colour ? "colour" : "style";
}

async function demoFallback(input: GenerateInput, provider: string, demoReason: NonNullable<GenerateOutput["demoReason"]>) {
  const result = await new MockProvider().generate(input);
  return { ...result, provider, demoReason, estimateInr: 0 };
}

export async function generateWithFailover(input: GenerateInput, choice?: ProviderChoice): Promise<GenerateOutput> {
  const primary = choice ? selectProvider(choice.name, choice.apiKey) : selectProvider();
  if (primary.name === "mock") return demoFallback(input, primary.name, "no-key");
  const tool = regionOf(input);
  const pre = await preflightPhoto(input.image, tool);
  if (!pre.ok) return demoFallback(input, "mock:placement", "placement");
  const quality = primary.name === "openai" ? openAIQuality(input.quality) : input.quality;
  const gate = await beginPaidCall({
    provider: primary.name,
    quality,
    model: modelFor(primary.name, input.quality),
    tenantId: input.tenantId,
  });
  if (!gate.ok) return demoFallback(input, "mock:spend-cap", "spend-cap");
  const locked = await runLockedEdit({
    image: input.image,
    tool,
    edit: (attempt) => primary.generate({ ...input, maskPng: attempt === 1 ? pre.maskFile ?? undefined : undefined }),
  });
  if (!locked.ok) {
    if (gate.id) await releasePaidCall(gate.id);
    if (locked.reason === "provider") return demoFallback(input, `mock:failover-from-${primary.name}`, "failover");
    return demoFallback(input, "mock:placement", "placement");
  }
  return { ...locked.output, image: locked.image, estimateInr: gate.estimateInr };
}
