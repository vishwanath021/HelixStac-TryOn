import { AdminNav } from "@/components/admin/AdminNav";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { tenant, membership } = await pageTenant();
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[240px_1fr]">
      <AdminNav role={membership.role} name={tenant.name} credits={tenant.creditBalance} slug={tenant.slug} showAi={membership.role === "OWNER"} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
