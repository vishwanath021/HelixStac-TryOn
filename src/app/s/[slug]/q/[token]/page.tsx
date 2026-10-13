import { notFound } from "next/navigation";
import { QueueTicket } from "@/components/guest/QueueTicket";
import { SalonPaused } from "@/components/guest/SalonPaused";
import { QueueError, guestTicket } from "@/lib/queue/service";
import { loadTenantBySlug } from "@/lib/salon";

export const dynamic = "force-dynamic";

export default async function QueueStatusPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const tenant = await loadTenantBySlug(slug);
  if (!tenant || !tenant.productQueue) notFound();
  if (tenant.status === "SUSPENDED") return <SalonPaused name={tenant.name} />;
  try {
    const ticket = await guestTicket(tenant.slug, token);
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="page-title">{tenant.name}</h1>
        <QueueTicket slug={tenant.slug} initial={ticket} />
      </main>
    );
  } catch (error) {
    if (error instanceof QueueError) notFound();
    throw error;
  }
}
