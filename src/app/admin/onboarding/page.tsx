import { OnboardingWizard } from "@/components/admin/OnboardingWizard";
import { parseJson } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { pageTenant } from "@/lib/session";
import { enabledTools } from "@/lib/tools";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { tenant } = await pageTenant();
  const services = await prisma.service.findMany({ where: { tenantId: tenant.id, active: true } });
  return (
    <main>
      <h1 className="mb-4 page-title">Onboarding</h1>
      <OnboardingWizard
        hairstyleOnly={enabledTools().size === 1 && enabledTools().has("hairstyle")}
        initial={{
          name: tenant.name,
          primaryColor: tenant.primaryColor,
          whatsapp: tenant.whatsapp,
          address: tenant.address,
          languages: parseJson<string[]>(tenant.languages, ["en"]),
          services: services.map((service) => ({ key: service.key, name: service.name, priceInr: service.priceInr })),
        }}
      />
    </main>
  );
}
