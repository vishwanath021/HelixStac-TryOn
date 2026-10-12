import { afterAll, describe, expect, it } from "vitest";
import { CreditError, reserveCredits, settleCredits } from "@/lib/credits";
import { prisma } from "@/lib/prisma";

describe("credit ledger", () => {
  const slug = `credits-${Date.now()}`;
  let tenantId = "";

  it("reserves, commits, and refunds without going negative", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug, name: "Credit Test", creditBalance: 3, whatsapp: "919800000000" },
    });
    tenantId = tenant.id;
    const left = await reserveCredits(tenantId, 2, "ref-a");
    expect(left).toBe(1);
    await settleCredits(tenantId, "ref-a", "COMMIT");
    await expect(reserveCredits(tenantId, 2, "ref-b")).rejects.toBeInstanceOf(CreditError);
    const refundedFrom = await reserveCredits(tenantId, 1, "ref-c");
    expect(refundedFrom).toBe(0);
    await settleCredits(tenantId, "ref-c", "REFUND");
    const after = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(after.creditBalance).toBe(1);
    const reasons = await prisma.creditLedger.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } });
    expect(reasons.map((row) => row.reason)).toEqual(["RESERVE", "COMMIT", "RESERVE", "REFUND"]);
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });
});
