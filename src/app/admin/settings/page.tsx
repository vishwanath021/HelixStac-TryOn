import { SettingsForm } from "@/components/admin/SettingsForm";
import { planById } from "@/data/plans";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { tenant, membership } = await pageTenant();
  if (membership.role !== "OWNER") {
    return <main><h1 className="font-serif text-4xl">Settings</h1><p className="mt-2">Staff can edit the catalogue and leads. Brand and billing stay with the owner.</p></main>;
  }
  return (
    <main>
      <h1 className="mb-4 font-serif text-4xl">Settings</h1>
      <SettingsForm
        canRemoveBranding={planById(tenant.plan).removeBranding}
        initial={{
          name: tenant.name,
          primaryColor: tenant.primaryColor,
          accentColor: tenant.accentColor,
          whatsapp: tenant.whatsapp,
          address: tenant.address,
          mapsUrl: tenant.mapsUrl,
          city: tenant.city,
          gstin: tenant.gstin || "",
          removeBranding: tenant.removeBranding,
          toolColour: tenant.toolColour,
          toolStyle: tenant.toolStyle,
          toolBrows: tenant.toolBrows,
          toolBeard: tenant.toolBeard,
          toolNails: tenant.toolNails,
          anonDailyCap: tenant.anonDailyCap,
          memberDailyCap: tenant.memberDailyCap,
          requireLoginToBook: tenant.requireLoginToBook,
        }}
      />
    </main>
  );
}
