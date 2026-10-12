import { CREDIT_PACKS, planById, TRIAL_DAYS } from "@/data/plans";
import { grantCredits } from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import { withGst } from "@/lib/pricing";

async function nextInvoiceNumber() {
  const count = await prisma.invoice.count();
  return `HS-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
}

export async function activatePlan(input: {
  tenantId: string;
  plan: string;
  interval: "monthly" | "yearly";
  provider: string;
  externalId?: string;
  chargeSetup: boolean;
}) {
  const plan = planById(input.plan);
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + (input.interval === "yearly" ? 12 : 1));
  await prisma.tenant.update({
    where: { id: input.tenantId },
    data: {
      plan: plan.id,
      status: "ACTIVE",
      removeBranding: plan.removeBranding,
      dailyCap: plan.credits,
      trialEndsAt: null,
    },
  });
  await prisma.subscription.upsert({
    where: { tenantId: input.tenantId },
    create: {
      tenantId: input.tenantId,
      plan: plan.id,
      interval: input.interval,
      provider: input.provider,
      externalId: input.externalId,
      status: "ACTIVE",
      currentPeriodEnd: periodEnd,
    },
    update: {
      plan: plan.id,
      interval: input.interval,
      provider: input.provider,
      externalId: input.externalId,
      status: "ACTIVE",
      currentPeriodEnd: periodEnd,
    },
  });
  await grantCredits(input.tenantId, plan.credits, "PLAN_GRANT", input.externalId || plan.id);
  const recurring = input.interval === "yearly" ? plan.monthlyExGst * 10 : plan.monthlyExGst;
  const setup = input.chargeSetup ? plan.setupExGst : 0;
  const money = withGst(recurring + setup);
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: input.tenantId,
      number: await nextInvoiceNumber(),
      amountExGst: recurring + setup,
      gstInr: money.gstInr,
      totalInr: money.totalInr,
      description: `${plan.name} ${input.interval}${setup ? ` + setup` : ""} (ex-GST ₹${recurring + setup})`,
      status: "PAID",
    },
  });
  return { plan: plan.id, credits: plan.credits, invoiceNumber: invoice.number, totalInr: invoice.totalInr };
}

export async function addCreditPack(tenantId: string, packId: string, provider: string, externalId?: string) {
  const pack = CREDIT_PACKS.find((item) => item.id === packId);
  if (!pack) throw new Error("UNKNOWN_PACK");
  await grantCredits(tenantId, pack.credits, "PACK", externalId || pack.id);
  const money = withGst(pack.priceExGst);
  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      number: await nextInvoiceNumber(),
      amountExGst: pack.priceExGst,
      gstInr: money.gstInr,
      totalInr: money.totalInr,
      description: `${pack.credits} preview credits via ${provider}`,
      status: "PAID",
    },
  });
  return { credits: pack.credits, invoiceNumber: invoice.number, totalInr: invoice.totalInr };
}

export function trialEndFromNow() {
  const end = new Date();
  end.setDate(end.getDate() + TRIAL_DAYS);
  return end;
}
