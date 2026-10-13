import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { GuestHub } from "@/components/guest/GuestHub";
import { SalonPaused } from "@/components/guest/SalonPaused";
import { ownerFeatures } from "@/lib/features";
import { phoneLoginConfigured } from "@/lib/otp";
import { loadTenantByHost, loadTenantBySlug, toSalonConfig } from "@/lib/salon";

export const dynamic = "force-dynamic";

export default async function MePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ book?: string; look?: string; styleId?: string; tool?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const headerList = await headers();
  const host = headerList.get("x-tenant-host") || headerList.get("host") || "";
  const tenant = slug === "by-host" ? await loadTenantByHost(host.split(":")[0] || "") : await loadTenantBySlug(slug);
  if (!ownerFeatures().guestHub) notFound();
  if (!tenant) notFound();
  if (tenant.status === "SUSPENDED") return <SalonPaused name={tenant.name} />;
  return (
    <GuestHub
      config={toSalonConfig(tenant)}
      book={query.book === "1"}
      look={query.look}
      styleId={query.styleId}
      tool={query.tool}
      phoneLogin={phoneLoginConfigured()}
    />
  );
}
