import { notFound } from "next/navigation";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const { tenant } = await pageTenant();
  if (!tenant.productQueue) notFound();
  return (
    <main>
      <h1 className="page-title">Queue</h1>
      <p className="mt-2 text-sm text-muted">Queue and alerts are coming soon.</p>
    </main>
  );
}
