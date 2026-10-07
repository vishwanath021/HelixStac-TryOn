import { numberEnv } from "@/lib/env";
import { logInfo } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { actualIsKnown, capPaise } from "@/lib/ai/cost-source";
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

/** Rows that still represent provider spend or a reservation. Customer credit refunds do not clear these. */
export const SPEND_CAP_STATUSES = ["CHARGED", "BILLED_FAILED", "UNCERTAIN"] as const;

export function countsTowardSpendCap(status: string) {
  return (SPEND_CAP_STATUSES as readonly string[]).includes(status);
}

export async function releasePaidCall(id: string, status: "REFUNDED" | "BILLED_FAILED" | "UNCERTAIN" = "REFUNDED") {
  if (!id) return;
  const counts = status !== "REFUNDED";
  await prisma.aiCall.updateMany({ where: { id, status: "CHARGED" }, data: { status, charged: counts } });
}

type CapRow = { estimatePaise: number; costInrPaise: number; costSource: string; charged: boolean };

export async function sumCapPaise(
  findMany: (args: object) => Promise<CapRow[]>,
  extra?: { createdAt?: { gte: Date } },
) {
  const rows = await findMany({
    where: { ...spendCapWhere(), ...extra },
    select: { estimatePaise: true, costInrPaise: true, costSource: true, charged: true },
  });
  return rows.reduce((sum, row) => sum + capPaise(row), 0);
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
    /** usage, billing, price_list, manual, timeout, or estimate. Omitted follows token usage. */
    costSource?: string;
    providerRequestId?: string;
  },
) {
  if (!id) return;
  const fromUsage = args.billed ? costUsdFromUsage(args.model, args.usage) : null;
  const source = args.costSource ?? (fromUsage != null ? "usage" : "estimate");
  const known = args.billed && (args.costSource ? actualIsKnown(args.costSource) : fromUsage != null);
  const usd = known ? (fromUsage ?? args.costUsd) : 0;
  const inr = known ? (fromUsage != null ? exactInr(fromUsage) : exactInr(args.costUsd)) : 0;
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
      ...(args.providerRequestId ? { providerRequestId: args.providerRequestId } : {}),
    },
  });
}

/** Super-admin correction. The reserved estimate is left as it was. */
export async function correctActualCost(args: { id: string; actorId: string; actualUsd: number; note: string }) {
  const row = await prisma.aiCall.findUnique({ where: { id: args.id } });
  if (!row) return { ok: false as const, message: "That ledger row was not found." };
  const note = args.note.trim();
  if (!note) return { ok: false as const, message: "An audit note is required." };
  if (!Number.isFinite(args.actualUsd) || args.actualUsd < 0 || args.actualUsd > 1000) {
    return { ok: false as const, message: "Enter the billed amount in US dollars." };
  }
  const inr = exactInr(args.actualUsd);
  await prisma.aiCall.update({
    where: { id: row.id },
    data: {
      costUsdMicros: Math.round(args.actualUsd * 1_000_000),
      costInrPaise: Math.round(inr * 100),
      costSource: "manual",
      costNote: note.slice(0, 500),
      billed: true,
      charged: true,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: args.actorId,
      action: "correct_actual",
      target: row.id,
      meta: JSON.stringify({
        note: note.slice(0, 500),
        previousSource: row.costSource,
        previousUsdMicros: row.costUsdMicros,
        nextUsdMicros: Math.round(args.actualUsd * 1_000_000),
        model: row.model,
      }),
    },
  });
  return { ok: true as const, message: `Actual set to $${args.actualUsd.toFixed(3)} (₹${inr.toFixed(2)}).` };
}

export function spendCapWhere() {
  return { status: { in: [...SPEND_CAP_STATUSES] } };
}

export async function spendSummary() {
  const rows = await prisma.aiCall.findMany({
    where: spendCapWhere(),
    select: { estimatePaise: true, costInrPaise: true, costSource: true, charged: true },
  });
  const known = rows.filter((row) => row.charged && actualIsKnown(row.costSource));
  return {
    /** Cap basis. Actual once that cost is known. An unknown bill stays on the reserved estimate. */
    spentInr: rows.reduce((sum, row) => sum + capPaise(row), 0) / 100,
    /** Known actuals at FX, with no 1.08 buffer. */
    actualInr: known.reduce((sum, row) => sum + row.costInrPaise, 0) / 100,
    actualCalls: known.length,
    capInr: spendCapInr(),
    calls: rows.length,
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
      const spent = await sumCapPaise(tx.aiCall.findMany.bind(tx.aiCall));
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
