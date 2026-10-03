import { randomUUID } from "node:crypto";
import { activatePlan, addCreditPack } from "@/lib/billing/apply";
import type { BillingProvider } from "@/lib/billing/types";
import { appBaseUrl } from "@/lib/env";

export class MockBilling implements BillingProvider {
  name = "mock";

  async createSubscription(input: { tenantId: string; plan: string; interval: "monthly" | "yearly" }) {
    const externalId = `mock_sub_${randomUUID()}`;
    const existing = await import("@/lib/prisma").then((mod) => mod.prisma.subscription.findUnique({ where: { tenantId: input.tenantId } }));
    await activatePlan({ ...input, provider: this.name, externalId, chargeSetup: !existing });
    return { checkoutUrl: `${appBaseUrl()}/admin/billing?paid=1`, externalId };
  }

  async createCreditPackOrder(input: { tenantId: string; packId: string }) {
    const externalId = `mock_pack_${randomUUID()}`;
    await addCreditPack(input.tenantId, input.packId, this.name, externalId);
    return { checkoutUrl: `${appBaseUrl()}/admin/billing?pack=1`, externalId };
  }

  async cancelSubscription(externalId: string) {
    const { prisma } = await import("@/lib/prisma");
    await prisma.subscription.updateMany({ where: { externalId }, data: { status: "CANCELLED" } });
  }

  async handleWebhook(): Promise<import("@/lib/billing/types").BillingEvent> {
    return { type: "ignored", externalId: "mock" };
  }
}
