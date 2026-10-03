import { numberEnv } from "@/lib/env";
import { logInfo } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { costUsdFromUsage, exactInr, isModelTier, tierRequest, type UsageNumbers } from "@/lib/ai/tiers";

const DEFAULTS: Record<string, number> = {
  GEMINI_STANDARD: 3.5,
  GEMINI_HD: 7,
  OPENAI_LOW: 2,
  OPENAI_MEDIUM: 7,
  OPENAI_HIGH: 26,
  REPLICATE_STANDARD: 4,
  FAL_STANDARD: 4,
};

let queue: Promise<unknown> = Promise.resolve();

function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function spendCapInr() {
  return Math.max(0, numberEnv("AI_SPEND_CAP_INR", 500));
}

/** Configurable estimate. Not an invoice from the provider. */
export function costPerCallInr(provider: string, quality: string) {
  const key = `AI_COST_PER_CALL_INR_${provider.toUpperCase()}_${quality.toUpperCase()}`;
  const specific = process.env[key];
  if (specific !== undefined && specific !== "" && Number.isFinite(Number(specific))) return Math.max(0, Number(specific));
  if ((provider === "openai" || provider === "gemini") && isModelTier(quality)) return tierRequest(provider, quality).estimateInr;
  if (provider === "gemini" && quality === "standard") return numberEnv("AI_COST_INR_STANDARD", DEFAULTS.GEMINI_STANDARD);
  if (provider === "gemini" && quality === "hd") return numberEnv("AI_COST_INR_HD", DEFAULTS.GEMINI_HD);
  return DEFAULTS[`${provider.toUpperCase()}_${quality.toUpperCase()}`] ?? numberEnv("AI_COST_INR_STANDARD", 3.5);
}

export async function releasePaidCall(id: string) {
  if (!id) return;
  await prisma.aiCall.updateMany({ where: { id, status: "CHARGED" }, data: { status: "REFUNDED", charged: false } });
}

export async function finalizePaidCall(
  id: string,
  args: {
    model: string;
    billed: boolean;
    charged: boolean;
    costUsd: number;
    estimateInr?: number;
    usage?: UsageNumbers;
    latencyMs?: number;
    imageSize?: string;
  },
) {
  if (!id) return;
  const fromUsage = args.billed ? costUsdFromUsage(args.model, args.usage) : null;
  const usd = !args.billed ? 0 : fromUsage ?? args.costUsd;
  const inr = !args.billed ? 0 : fromUsage != null ? exactInr(fromUsage) : (args.estimateInr ?? exactInr(args.costUsd));
  const source = fromUsage != null ? "usage" : "estimate";
  await prisma.aiCall.updateMany({
    where: { id },
    data: {
      billed: args.billed,
      charged: args.charged,
      costUsdMicros: Math.round(usd * 1_000_000),
      costInrPaise: Math.round(inr * 100),
      costSource: source,
      inputTokens: args.usage?.inputTokens ?? 0,
      outputTokens: args.usage?.outputTokens ?? 0,
      totalTokens: args.usage?.totalTokens ?? 0,
      usageJson: args.usage ? JSON.stringify(args.usage) : "",
      latencyMs: args.latencyMs ?? 0,
      ...(args.imageSize ? { imageSize: args.imageSize } : {}),
    },
  });
}

export async function spendSummary() {
  const agg = await prisma.aiCall.aggregate({
    where: { status: "CHARGED" },
    _sum: { estimatePaise: true },
    _count: true,
  });
  return {
    spentInr: (agg._sum.estimatePaise || 0) / 100,
    capInr: spendCapInr(),
    calls: agg._count,
  };
}

export async function beginPaidCall(args: {
  provider: string;
  quality: string;
  model: string;
  tenantId: string;
  tool?: string;
  tier?: string;
  imageSize?: string;
  estimateInr?: number;
  estimateUsd?: number;
}) {
  const estimateInr = args.estimateInr ?? costPerCallInr(args.provider, args.quality);
  const estimatePaise = Math.round(estimateInr * 100);
  const capPaise = Math.round(spendCapInr() * 100);
  return exclusive(() =>
    prisma.$transaction(async (tx) => {
      const agg = await tx.aiCall.aggregate({ where: { status: "CHARGED" }, _sum: { estimatePaise: true } });
      const spent = agg._sum.estimatePaise || 0;
      if (spent + estimatePaise > capPaise) {
        await tx.aiCall.create({
          data: {
            provider: args.provider,
            quality: args.quality,
            model: args.model,
            estimatePaise: 0,
            tenantId: args.tenantId,
            status: "REFUSED",
            tool: args.tool || "",
            tier: args.tier || args.quality,
            imageSize: args.imageSize || "",
            charged: false,
            billed: false,
          },
        });
        logInfo("ai spend refused", {
          provider: args.provider,
          quality: args.quality,
          model: args.model,
          estimateInr,
          spentInr: spent / 100,
          capInr: capPaise / 100,
        });
        return { ok: false as const, id: "", estimateInr, spentInr: spent / 100, capInr: capPaise / 100 };
      }
      const row = await tx.aiCall.create({
        data: {
          provider: args.provider,
          quality: args.quality,
          model: args.model,
          estimatePaise,
          tenantId: args.tenantId,
          status: "CHARGED",
          tool: args.tool || "",
          tier: args.tier || args.quality,
          imageSize: args.imageSize || "",
          costUsdMicros: Math.round((args.estimateUsd || 0) * 1_000_000),
          costInrPaise: estimatePaise,
          charged: true,
          billed: false,
          costSource: "estimate",
        },
      });
      logInfo("ai call estimate", {
        provider: args.provider,
        quality: args.quality,
        model: args.model,
        estimateInr,
        spentInr: (spent + estimatePaise) / 100,
        capInr: capPaise / 100,
      });
      return { ok: true as const, id: row.id, estimateInr, spentInr: (spent + estimatePaise) / 100, capInr: capPaise / 100 };
    }),
  );
}
