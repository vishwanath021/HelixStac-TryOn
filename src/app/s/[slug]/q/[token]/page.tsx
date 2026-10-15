import { notFound } from "next/navigation";
import { QueueTicket } from "@/components/guest/QueueTicket";
import { SalonPaused } from "@/components/guest/SalonPaused";
import { QueueError, guestTicket } from "@/lib/queue/service";
import { loadTenantBySlug } from "@/lib/salon";

export const dynamic = "force-dynamic";

export default async function QueueStatusPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const tenant = await loadTenantBySlug(slug);
  if (!tenant) notFound();
  if (!tenant.productQueue) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="page-title">{tenant.name}</h1>
        <p className="mt-3 text-sm">The queue is turned off for this salon.</p>
      </main>
    );
  }
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
    if (error instanceof QueueError) {
      return (
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="page-title">{tenant.name}</h1>
          <p className="mt-3 text-sm">That visit was not found.</p>
        </main>
      );
    }
    throw error;
  }
}
