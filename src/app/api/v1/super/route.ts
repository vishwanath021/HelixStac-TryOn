import { NextResponse } from "next/server";
import { PLANS } from "@/data/plans";
import { numberEnv } from "@/lib/env";
import { previewCogsInr } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { requireSuper } from "@/lib/session";

export async function GET() {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "desc" }, include: { subscription: true, _count: { select: { leads: true, tryOns: true } } } });
  const standardInr = numberEnv("AI_COST_INR_STANDARD", 3.5);
  const hdInr = numberEnv("AI_COST_INR_HD", 7);
  const rows = [];
  let mrr = 0;
  for (const tenant of tenants) {
    if (tenant.status === "ACTIVE") mrr += PLANS[tenant.plan as keyof typeof PLANS]?.monthlyExGst || 0;
    const [standard, hd] = await Promise.all([
      prisma.tryOn.count({ where: { tenantId: tenant.id, status: "SUCCEEDED", quality: "standard" } }),
      prisma.tryOn.count({ where: { tenantId: tenant.id, status: "SUCCEEDED", quality: "hd" } }),
    ]);
    rows.push({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
      credits: tenant.creditBalance,
      leads: tenant._count.leads,
      tryOns: tenant._count.tryOns,
      cogsInr: previewCogsInr(standard, hd, standardInr, hdInr),
      standard,
      hd,
    });
  }
  return NextResponse.json({
    mrrExGst: mrr,
    tenants: rows,
    assumption: `COGS uses ₹${standardInr} per standard preview and ₹${hdInr} per HD preview. Assumption: about ₹3.5 Lite and ₹7 Flash at ₹96/USD including 8% retries. Not an invoice from Google.`,
  });
}
