import { PLANS } from "@/data/plans";
import { spendCapInr } from "@/lib/ai/spend";
import { parseTier, projectSalonMonth, tierRequest, type ImageProviderName } from "@/lib/ai/tiers";
import { prisma } from "@/lib/prisma";

export type CostCallRow = {
  id: string;
  at: string;
  tenantId: string;
  tenantName: string;
  tool: string;
  provider: string;
  model: string;
  tier: string;
  quality: string;
  imageSize: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costInr: number;
  chargedInr: number;
  charged: boolean;
  billed: boolean;
  status: string;
  costSource: string;
};

function inr(paise: number) {
  return Math.round(paise) / 100;
}

function startOfDay(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfMonth(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function chargedSince(from: Date) {
  const agg = await prisma.aiCall.aggregate({
    where: { status: "CHARGED", createdAt: { gte: from } },
    _sum: { estimatePaise: true },
  });
  return inr(agg._sum.estimatePaise || 0);
}

export async function costReport(args: { since?: Date; imagesPerMonth?: number; provider?: ImageProviderName; tier?: string } = {}) {
  const now = new Date();
  const imagesPerMonth = Math.max(0, Math.round(args.imagesPerMonth ?? 100));
  const since = args.since && !Number.isNaN(args.since.getTime()) ? args.since : startOfDay(now);
  const [recent, billed, sessionInr, dayInr, monthInr, capSpend] = await Promise.all([
    prisma.aiCall.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.aiCall.findMany({ where: { billed: true }, select: { tool: true, tier: true, costInrPaise: true } }),
    chargedSince(since),
    chargedSince(startOfDay(now)),
    chargedSince(startOfMonth(now)),
    prisma.aiCall.aggregate({ where: { status: "CHARGED" }, _sum: { estimatePaise: true } }),
  ]);
  const ids = [...new Set(recent.map((row) => row.tenantId).filter((id) => id.length > 8))];
  const tenants = ids.length
    ? await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const names = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const groups = new Map<string, { tool: string; tier: string; total: number; count: number }>();
  for (const row of billed) {
    const key = `${row.tool}|${row.tier}`;
    const group = groups.get(key) || { tool: row.tool || "hair", tier: row.tier || "test", total: 0, count: 0 };
    group.total += row.costInrPaise;
    group.count += 1;
    groups.set(key, group);
  }
  const averages = [...groups.values()].map((group) => ({
    tool: group.tool,
    tier: group.tier,
    count: group.count,
    avgInr: Math.round((group.total / group.count)) / 100,
  }));
  const billedAvg = billed.length ? billed.reduce((sum, row) => sum + row.costInrPaise, 0) / billed.length / 100 : null;
  const provider = args.provider === "gemini" ? "gemini" : "openai";
  const tier = parseTier(args.tier);
  const fallback = tierRequest(provider, tier).estimateInr;
  const avgInr = billedAvg == null ? fallback : Math.round(billedAvg * 100) / 100;
  const calls: CostCallRow[] = recent.map((row) => ({
    id: row.id,
    at: row.createdAt.toISOString(),
    tenantId: row.tenantId,
    tenantName: names.get(row.tenantId) || row.tenantId || "platform",
    tool: row.tool,
    provider: row.provider,
    model: row.model,
    tier: row.tier,
    quality: row.quality,
    imageSize: row.imageSize,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    costUsd: row.costUsdMicros / 1_000_000,
    costInr: inr(row.costInrPaise),
    chargedInr: row.charged ? inr(row.estimatePaise) : 0,
    charged: row.charged,
    billed: row.billed,
    status: row.status,
    costSource: row.costSource,
  }));
  return {
    capInr: spendCapInr(),
    spentInr: inr(capSpend._sum.estimatePaise || 0),
    sessionInr,
    dayInr,
    monthInr,
    usingEstimate: billedAvg == null,
    averageInr: avgInr,
    last: calls[0] || null,
    averages,
    calls,
    imagesPerMonth,
    plans: projectSalonMonth(avgInr, imagesPerMonth).map((plan) => ({
      ...plan,
      priceInr: plan.id === "STARTER" ? PLANS.STARTER.monthlyExGst : plan.id === "PRO" ? PLANS.PRO.monthlyExGst : PLANS.CHAIN.monthlyExGst,
    })),
  };
}
