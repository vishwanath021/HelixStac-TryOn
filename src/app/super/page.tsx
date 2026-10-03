import { SuperPanel } from "@/components/admin/SuperPanel";
import { numberEnv } from "@/lib/env";
import { PLANS } from "@/data/plans";
import { previewCogsInr } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { pageSuper } from "@/lib/session";
import { SignOutButton } from "@/components/admin/SignOutButton";

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
  const assumption = `COGS is an assumption: ₹${standardInr} per standard preview and ₹${hdInr} per HD preview (about ₹3.5 Lite and ₹7 Flash at ₹96/USD, including 8% retries). It is not a bill from the provider.`;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-serif text-4xl">HelixStac</h1>
        <SignOutButton />
      </div>
      <SuperPanel rows={rows} mrr={mrr} assumption={assumption} />
    </main>
  );
}
