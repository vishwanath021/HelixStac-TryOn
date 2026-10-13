import { PLANS } from "@/data/plans";
import { kolkataMonthStart } from "@/lib/ai/spend";
import { prisma } from "@/lib/prisma";

export type SalonRecord = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  planName: string;
  status: string;
  credits: number;
  leads: number;
  tryOns: number;
  previewsThisMonth: number;
  ownerName: string;
  ownerEmail: string;
  host: string;
  createdAt: string;
  trialEndsAt: string | null;
};

/** One tenant query plus one grouped preview count for the Kolkata month. */
export async function loadSalons(): Promise<SalonRecord[]> {
  const since = kolkataMonthStart();
  const [tenants, grouped] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { leads: true, tryOns: true } },
        members: {
          where: { role: "OWNER" },
          take: 1,
          include: { user: { select: { name: true, email: true } } },
        },
        domains: { where: { verified: true }, take: 1, orderBy: { host: "asc" }, select: { host: true } },
      },
    }),
    prisma.tryOn.groupBy({
      by: ["tenantId"],
      where: { createdAt: { gte: since }, status: "SUCCEEDED" },
      _count: { _all: true },
    }),
  ]);
  const month = new Map(grouped.map((row) => [row.tenantId, row._count._all]));
  return tenants.map((tenant) => {
    const plan = PLANS[tenant.plan as keyof typeof PLANS];
    const owner = tenant.members[0]?.user;
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      plan: tenant.plan,
      planName: plan?.name || tenant.plan,
      status: tenant.status,
      credits: tenant.creditBalance,
      leads: tenant._count.leads,
      tryOns: tenant._count.tryOns,
      previewsThisMonth: month.get(tenant.id) || 0,
      ownerName: owner?.name || "",
      ownerEmail: owner?.email || "",
      host: tenant.domains[0]?.host || "",
      createdAt: tenant.createdAt.toISOString(),
      trialEndsAt: tenant.trialEndsAt?.toISOString() || null,
    };
  });
}

export function salonStats(rows: SalonRecord[]) {
  let active = 0;
  let trials = 0;
  let mrr = 0;
  let previews = 0;
  let credits = 0;
  for (const row of rows) {
    if (row.status === "ACTIVE") {
      active += 1;
      mrr += PLANS[row.plan as keyof typeof PLANS]?.monthlyExGst || 0;
    }
    if (row.status === "TRIAL") trials += 1;
    previews += row.previewsThisMonth;
    credits += row.credits;
  }
  return { active, trials, mrr, previews, credits };
}
