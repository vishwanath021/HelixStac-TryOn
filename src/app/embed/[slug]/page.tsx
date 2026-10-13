import { notFound } from "next/navigation";
import { SalonPaused } from "@/components/guest/SalonPaused";
import { TryOnApp } from "@/components/tryon/TryOnApp";
import { ownerFeatures } from "@/lib/features";
import { loadTenantBySlug, toSalonConfig } from "@/lib/salon";

export const dynamic = "force-dynamic";

export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await loadTenantBySlug(slug);
  if (!ownerFeatures().embed) notFound();
  if (!tenant || !tenant.productTryOn) notFound();
  if (tenant.status === "SUSPENDED") return <SalonPaused name={tenant.name} />;
  return <TryOnApp config={toSalonConfig(tenant)} embed />;
}
