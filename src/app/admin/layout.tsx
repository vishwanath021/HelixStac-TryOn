import { AdminNav } from "@/components/admin/AdminNav";
import { ownerFeatures } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { tenant, membership, session } = await pageTenant();
  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    include: { tenant: { select: { id: true, name: true } } },
    orderBy: { tenant: { name: "asc" } },
  });
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[240px_1fr]">
      <AdminNav
        role={membership.role}
        name={tenant.name}
        credits={tenant.creditBalance}
        slug={tenant.slug}
        productTryOn={tenant.productTryOn}
        productQueue={tenant.productQueue}
        onboardingDone={tenant.onboardingDone}
        features={ownerFeatures()}
        currentTenantId={tenant.id}
        salons={memberships.map((item) => ({ id: item.tenant.id, name: item.tenant.name }))}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
