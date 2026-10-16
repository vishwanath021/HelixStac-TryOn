import { ServiceEditor } from "@/components/admin/ServiceEditor";
import { BRIDAL_PACKAGES } from "@/data/bridal";
import { prisma } from "@/lib/prisma";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const { tenant } = await pageTenant();
  for (const pack of BRIDAL_PACKAGES) {
    await prisma.service.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: pack.key } },
      update: {},
      create: { tenantId: tenant.id, key: pack.key, name: pack.name, priceInr: 0, nameI18n: "{}", active: true },
    });
  }
  const services = await prisma.service.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } });
  return (
    <main>
      <h1 className="mb-4 page-title">Services and prices</h1>
      <ServiceEditor initial={services.map((service) => ({ id: service.id, key: service.key, name: service.name, priceInr: service.priceInr, durationMin: service.durationMin, active: service.active }))} />
    </main>
  );
}
