import { prisma } from "@/lib/prisma";

export class CreditError extends Error {
  constructor(public code: "INSUFFICIENT" | "SUSPENDED") {
    super(code);
  }
}

export async function reserveCredits(tenantId: string, amount: number, refId: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.tenant.updateMany({
      where: { id: tenantId, creditBalance: { gte: amount }, status: { not: "SUSPENDED" } },
      data: { creditBalance: { decrement: amount } },
    });
    if (updated.count !== 1) {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant || tenant.status === "SUSPENDED") throw new CreditError("SUSPENDED");
      throw new CreditError("INSUFFICIENT");
    }
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    await tx.creditLedger.create({
      data: { tenantId, delta: -amount, reason: "RESERVE", refId, balanceAfter: tenant.creditBalance },
    });
    return tenant.creditBalance;
  });
}

export async function settleCredits(tenantId: string, refId: string, outcome: "COMMIT" | "REFUND") {
  return prisma.$transaction(async (tx) => {
    const reserve = await tx.creditLedger.findFirst({ where: { tenantId, refId, reason: "RESERVE" } });
    if (!reserve) return null;
    const existing = await tx.creditLedger.findFirst({
      where: { tenantId, refId, reason: { in: ["COMMIT", "REFUND"] } },
    });
    if (existing) return existing;
    if (outcome === "COMMIT") {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      return tx.creditLedger.create({
        data: { tenantId, delta: 0, reason: "COMMIT", refId, balanceAfter: tenant.creditBalance },
      });
    }
    const amount = Math.abs(reserve.delta);
    const tenant = await tx.tenant.update({
      where: { id: tenantId },
      data: { creditBalance: { increment: amount } },
    });
    return tx.creditLedger.create({
      data: { tenantId, delta: amount, reason: "REFUND", refId, balanceAfter: tenant.creditBalance },
    });
  });
}

export async function grantCredits(tenantId: string, amount: number, reason: string, refId?: string) {
  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({
      where: { id: tenantId },
      data: { creditBalance: { increment: amount } },
    });
    if (tenant.creditBalance < 0) {
      throw new CreditError("INSUFFICIENT");
    }
    await tx.creditLedger.create({
      data: { tenantId, delta: amount, reason, refId, balanceAfter: tenant.creditBalance },
    });
    return tenant.creditBalance;
  });
}

/** Refunds reserves that never committed or refunded. Called before a new generation. */
export async function refundStaleReserves(tenantId: string, olderThanMs = 5 * 60 * 1000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const reserves = await prisma.creditLedger.findMany({
    where: { tenantId, reason: "RESERVE", createdAt: { lt: cutoff } },
  });
  for (const reserve of reserves) {
    if (!reserve.refId) continue;
    const settled = await prisma.creditLedger.findFirst({
      where: { tenantId, refId: reserve.refId, reason: { in: ["COMMIT", "REFUND"] } },
    });
    if (!settled) await settleCredits(tenantId, reserve.refId, "REFUND");
  }
}
