import { PLANS } from "@/data/plans";
import { actualIsKnown, capPaise, costSourceLabel, KNOWN_ACTUAL_SOURCES } from "@/lib/ai/cost-source";
import { spendCapInr, sumCapPaise } from "@/lib/ai/spend";
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
  estimateInr: number;
  actualKnown: boolean;
  sourceLabel: string;
  costNote: string;
  providerRequestId: string;
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
  const paise = await sumCapPaise(prisma.aiCall.findMany.bind(prisma.aiCall), { createdAt: { gte: from } });
  return inr(paise);
}

function callWhere(args: { filterProvider?: string; filterModel?: string; from?: Date; to?: Date }) {
  const createdAt = args.from || args.to ? { gte: args.from, lte: args.to } : undefined;
  return {
    ...(args.filterProvider ? { provider: args.filterProvider } : {}),
    ...(args.filterModel ? { model: { contains: args.filterModel } } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

export async function costReport(args: {
  since?: Date;
  imagesPerMonth?: number;
  provider?: ImageProviderName;
  tier?: string;
  page?: number;
  pageSize?: number;
  filterProvider?: string;
  filterModel?: string;
  from?: Date;
  to?: Date;
} = {}) {
  const now = new Date();
  const imagesPerMonth = Math.max(0, Math.round(args.imagesPerMonth ?? 100));
  const since = args.since && !Number.isNaN(args.since.getTime()) ? args.since : startOfDay(now);
  const pageSize = Math.min(50, Math.max(1, Math.round(args.pageSize ?? 20)));
  const where = callWhere(args);
  const [totalCount, billed, sessionInr, dayInr, monthInr, capSpend, estimateSum, actualSum, providerRows] = await Promise.all([
    prisma.aiCall.count({ where }),
    prisma.aiCall.findMany({ where: { billed: true }, select: { tool: true, tier: true, costInrPaise: true } }),
    chargedSince(since),
    chargedSince(startOfDay(now)),
    chargedSince(startOfMonth(now)),
    sumCapPaise(prisma.aiCall.findMany.bind(prisma.aiCall)),
    prisma.aiCall.aggregate({ where, _sum: { estimatePaise: true } }),
    prisma.aiCall.aggregate({ where: { ...where, costSource: { in: [...KNOWN_ACTUAL_SOURCES] } }, _sum: { costInrPaise: true }, _count: true }),
    prisma.aiCall.findMany({ distinct: ["provider"], select: { provider: true }, orderBy: { provider: "asc" } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.round(args.page ?? 1)));
  const recent = await prisma.aiCall.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const newest = page === 1 ? recent[0] : await prisma.aiCall.findFirst({ where, orderBy: { createdAt: "desc" } });
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
  const mapCall = (row: NonNullable<typeof newest>): CostCallRow => ({
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
    costUsd: actualIsKnown(row.costSource) ? row.costUsdMicros / 1_000_000 : 0,
    costInr: actualIsKnown(row.costSource) ? inr(row.costInrPaise) : 0,
    estimateInr: inr(row.estimatePaise),
    actualKnown: actualIsKnown(row.costSource),
    sourceLabel: costSourceLabel(row.costSource, row.status),
    costNote: row.costNote,
    providerRequestId: row.providerRequestId,
    chargedInr: row.charged ? inr(capPaise(row)) : 0,
    charged: row.charged,
    billed: row.billed,
    status: row.status,
    costSource: row.costSource,
  });
  const calls = recent.map(mapCall);
  return {
    capInr: spendCapInr(),
    spentInr: inr(capSpend),
    sessionInr,
    dayInr,
    monthInr,
    usingEstimate: billedAvg == null,
    averageInr: avgInr,
    last: newest ? mapCall(newest) : null,
    averages,
    calls,
    page,
    pageSize,
    totalCount,
    pageCount,
    providers: providerRows.map((row) => row.provider).filter((provider) => provider.length > 0),
    totals: {
      estimateInr: inr(estimateSum._sum.estimatePaise || 0),
      actualInr: inr(actualSum._sum.costInrPaise || 0),
      actualCount: actualSum._count,
    },
    imagesPerMonth,
    plans: projectSalonMonth(avgInr, imagesPerMonth).map((plan) => ({
      ...plan,
      priceInr: plan.id === "STARTER" ? PLANS.STARTER.monthlyExGst : plan.id === "PRO" ? PLANS.PRO.monthlyExGst : PLANS.CHAIN.monthlyExGst,
    })),
  };
}
