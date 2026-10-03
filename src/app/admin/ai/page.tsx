import { SalonAiForm } from "@/components/admin/SalonAiForm";
import { salonAiView } from "@/lib/ai/settings-store";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminAiPage() {
  const { tenant, membership } = await pageTenant();
  if (membership.role !== "OWNER") {
    return (
      <main>
        <h1 className="font-serif text-4xl">AI settings</h1>
        <p className="mt-2">Only the salon owner can change guest preview quality.</p>
      </main>
    );
  }
  const initial = await salonAiView(tenant.id);
  return (
    <main>
      <h1 className="mb-2 font-serif text-4xl">AI settings</h1>
      <p className="mb-4 max-w-xl text-sm leading-6">
        Guests use Test until you select Medium or High. Medium and High stay unavailable until HelixStac turns them on.
      </p>
      <SalonAiForm initial={initial} showKey={initial.allowByo} />
    </main>
  );
}
