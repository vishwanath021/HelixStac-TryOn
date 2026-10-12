import { ServiceEditor } from "@/components/admin/ServiceEditor";
import { prisma } from "@/lib/prisma";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const { tenant } = await pageTenant();
  const services = await prisma.service.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { name: "asc" } });
  return (
    <main>
      <h1 className="mb-4 page-title">Services and prices</h1>
      <ServiceEditor initial={services.map((service) => ({ id: service.id, key: service.key, name: service.name, priceInr: service.priceInr, durationMin: service.durationMin }))} />
    </main>
  );
}
