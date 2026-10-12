import { notFound } from "next/navigation";
import { TryOnApp } from "@/components/tryon/TryOnApp";
import { loadTenantBySlug, toSalonConfig } from "@/lib/salon";

export const dynamic = "force-dynamic";

export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await loadTenantBySlug(slug);
  if (!tenant) notFound();
  return <TryOnApp config={toSalonConfig(tenant)} embed />;
}
