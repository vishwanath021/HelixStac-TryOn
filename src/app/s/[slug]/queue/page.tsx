import { notFound } from "next/navigation";
import { SalonPaused } from "@/components/guest/SalonPaused";
import { QueueJoinForm } from "@/components/guest/QueueJoinForm";
import { loadTenantBySlug } from "@/lib/salon";
import { publicBoard } from "@/lib/queue/service";

export const dynamic = "force-dynamic";

export default async function GuestQueuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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
  const board = await publicBoard(tenant.slug);
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="page-title">{tenant.name}</h1>
      <QueueJoinForm initial={board} />
      <p className="mt-8 text-center text-xs text-muted"><a href="/login">Salon login</a></p>
    </main>
  );
}
