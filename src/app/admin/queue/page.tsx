import { notFound } from "next/navigation";
import { QueueDesk } from "@/components/admin/QueueDesk";
import { deskSnapshot } from "@/lib/queue/service";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const { tenant } = await pageTenant();
  if (!tenant.productQueue) notFound();
  const desk = await deskSnapshot(tenant.id);
  return (
    <main>
      <h1 className="page-title">Queue</h1>
      <p className="mt-1 text-sm text-muted">Open the line, tap NEXT, then Done when the guest leaves.</p>
      <QueueDesk initial={desk} lang={tenant.defaultLang} />
    </main>
  );
}
