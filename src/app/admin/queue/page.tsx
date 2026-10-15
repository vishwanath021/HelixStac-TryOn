import { QueueDesk } from "@/components/admin/QueueDesk";
import { prisma } from "@/lib/prisma";
import { deskSnapshot } from "@/lib/queue/service";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const { tenant } = await pageTenant();
  if (!tenant.productQueue) {
    return (
      <main>
        <h1 className="page-title">Queue</h1>
        <p className="mt-3 text-sm">Queue is turned off for this salon.</p>
      </main>
    );
  }
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [desk, tryOns] = await Promise.all([
    deskSnapshot(tenant.id),
    prisma.tryOn.count({ where: { tenantId: tenant.id, status: "SUCCEEDED", createdAt: { gte: since } } }),
  ]);
  return (
    <main>
      <h1 className="page-title">Queue</h1>
      <p className="mt-1 text-sm text-muted">{tryOns.toLocaleString("en-IN")} try-ons this month</p>
      <p className="mt-1 text-sm text-muted">Open the line, tap NEXT, then Done when the guest leaves.</p>
      <QueueDesk initial={desk} lang={tenant.defaultLang} />
    </main>
  );
}
