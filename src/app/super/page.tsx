import { SuperPanel } from "@/components/admin/SuperPanel";
import { spendSummary } from "@/lib/ai/spend";
import { numberEnv } from "@/lib/env";
import { PLANS } from "@/data/plans";
import { previewCogsInr } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { pageSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SuperPage() {
  await pageSuper();
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { leads: true, tryOns: true } } } });
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
    });
  }
  const spend = await spendSummary();
  const assumption = `COGS is an assumption: ₹${standardInr} per standard preview and ₹${hdInr} per HD preview (about ₹3.5 Lite and ₹7 Flash at ₹96/USD, including 8% retries). The spend cap uses the same kind of estimate. Neither number is a bill from the provider.`;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="page-title">Lookuvi</h1>
      <p className="mt-2 max-w-xl text-base text-muted">Salons, plans, and the assumed cost of previews.</p>
      <SuperPanel rows={rows} mrr={mrr} assumption={assumption} spend={spend} />
    </main>
  );
}
