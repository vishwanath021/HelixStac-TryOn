import { BilledProviderError, SpendCapError, UnbilledProviderError, UncertainBillingError } from "@/lib/ai/errors";
import { GeminiProvider } from "@/lib/ai/gemini";
import { MockProvider } from "@/lib/ai/mock";
import { OpenAIProvider } from "@/lib/ai/openai";
import { ReplicateStubProvider } from "@/lib/ai/replicate";
import { readTierFlags } from "@/lib/ai/settings-store";
import { beginPaidCall, finalizePaidCall, releasePaidCall } from "@/lib/ai/spend";
import { ledgerTool, resolveGuestTier, tierRequest, type ImageProviderName, type ModelTier } from "@/lib/ai/tiers";
import type { GenerateInput, GenerateOutput, ImageStyleProvider } from "@/lib/ai/types";
import { styleById } from "@/data/styles";
import { runLockedEdit } from "@/lib/face/pipeline";
import { hairExtentForStyle, preflightPhoto, type RegionTool } from "@/lib/face/region";
import { aiProviderName } from "@/lib/env";

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

function isImageProvider(name: string): name is ImageProviderName {
  return name === "openai" || name === "gemini";
}

async function demoFallback(input: GenerateInput, provider: string, demoReason: NonNullable<GenerateOutput["demoReason"]>) {
  const result = await new MockProvider().generate(input);
  return { ...result, provider, demoReason, estimateInr: 0 };
}

async function settleFailure(id: string, error: unknown, model: string, estimateInr: number, imageSize: string) {
  if (error instanceof BilledProviderError) {
    await finalizePaidCall(id, {
      model,
      billed: true,
      charged: true,
      costUsd: error.costUsd,
      estimateInr,
      usage: error.usage,
      imageSize,
    });
    await releasePaidCall(id, "BILLED_FAILED");
    return;
  }
  await finalizePaidCall(id, { model, billed: false, charged: false, costUsd: 0, estimateInr: 0, imageSize });
  await releasePaidCall(id, "REFUNDED");
}

export async function generateWithFailover(input: GenerateInput, choice?: ProviderChoice): Promise<GenerateOutput> {
  const primary = choice ? selectProvider(choice.name, choice.apiKey) : selectProvider();
  if (primary.name === "mock") return demoFallback(input, primary.name, "no-key");
  const tool = regionOf(input);
  const hairExtent = hairExtentForStyle(styleById(input.styleId), tool);
  const pre = await preflightPhoto(input.image, tool, { hairExtent });
  if (!pre.ok) return demoFallback(input, "mock:placement", "placement");

  const flags = await readTierFlags(input.tenantId);
  const tier: ModelTier = resolveGuestTier({ ...flags, purpose: "guest" });
  const spec = isImageProvider(primary.name) ? tierRequest(primary.name, tier) : null;
  const quality = spec ? spec.tier : input.quality;
  const model = spec?.model || primary.name;
  const imageSize = spec?.size || "";
  const estimateInr = spec?.estimateInr;
  const estimateUsd = spec?.estimateUsd;

  const locked = await runLockedEdit({
    image: input.image,
    tool,
    hairExtent,
    edit: async (attempt) => {
      const gate = await beginPaidCall({
        provider: primary.name,
        quality,
        model,
        tenantId: input.tenantId,
        tool: ledgerTool(input.kind, input.colour),
        tier: spec?.tier || "",
        imageSize,
        estimateInr,
        estimateUsd,
      });
      if (!gate.ok) throw new SpendCapError();
      try {
        const output = await primary.generate({
          ...input,
          tier,
          quality: tier === "high" ? "hd" : "standard",
          maskPng: attempt === 1 ? pre.maskFile ?? undefined : undefined,
        });
        await finalizePaidCall(gate.id, {
          model: output.model || model,
          billed: true,
          charged: true,
          costUsd: output.providerCostUsd,
          estimateInr: gate.estimateInr,
          usage: output.usage,
          latencyMs: output.latencyMs,
          imageSize: output.imageSize || imageSize,
        });
        return { ...output, callId: gate.id, estimateInr: gate.estimateInr };
      } catch (error) {
        if (error instanceof UncertainBillingError) {
          await finalizePaidCall(gate.id, {
            model,
            billed: true,
            charged: true,
            costUsd: estimateUsd || 0,
            estimateInr: gate.estimateInr,
            imageSize,
          });
          await releasePaidCall(gate.id, "UNCERTAIN");
          throw error;
        }
        await settleFailure(gate.id, error, model, gate.estimateInr, imageSize);
        throw error;
      }
    },
  });
  if (!locked.ok) {
    if (locked.callId && (locked.reason === "postcheck" || locked.reason === "face-guard")) {
      await releasePaidCall(locked.callId, "BILLED_FAILED");
    }
    if (locked.reason === "spend-cap") return demoFallback(input, "mock:spend-cap", "spend-cap");
    if (locked.reason === "uncertain") throw new UncertainBillingError(locked.message);
    if (locked.reason === "provider" || locked.reason === "unknown-model") {
      throw new UnbilledProviderError(locked.message);
    }
    return demoFallback(input, "mock:placement", "placement");
  }
  return { ...locked.output, image: locked.image, estimateInr: locked.output.estimateInr };
}
