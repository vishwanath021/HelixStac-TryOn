import { numberEnv } from "@/lib/env";
import { logInfo } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

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
  if (provider === "gemini" && quality === "standard") return numberEnv("AI_COST_INR_STANDARD", DEFAULTS.GEMINI_STANDARD);
  if (provider === "gemini" && quality === "hd") return numberEnv("AI_COST_INR_HD", DEFAULTS.GEMINI_HD);
  return DEFAULTS[`${provider.toUpperCase()}_${quality.toUpperCase()}`] ?? numberEnv("AI_COST_INR_STANDARD", 3.5);
}

export async function releasePaidCall(id: string) {
  if (!id) return;
  await prisma.aiCall.updateMany({ where: { id, status: "CHARGED" }, data: { status: "REFUNDED" } });
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

export async function beginPaidCall(args: { provider: string; quality: string; model: string; tenantId: string }) {
  const estimateInr = costPerCallInr(args.provider, args.quality);
  const estimatePaise = Math.round(estimateInr * 100);
  const capPaise = Math.round(spendCapInr() * 100);
  return exclusive(() =>
    prisma.$transaction(async (tx) => {
      const agg = await tx.aiCall.aggregate({ where: { status: "CHARGED" }, _sum: { estimatePaise: true } });
      const spent = agg._sum.estimatePaise || 0;
      if (spent + estimatePaise > capPaise) {
        await tx.aiCall.create({
          data: { provider: args.provider, quality: args.quality, model: args.model, estimatePaise: 0, tenantId: args.tenantId, status: "REFUSED" },
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
