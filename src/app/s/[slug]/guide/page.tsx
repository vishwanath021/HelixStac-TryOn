import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { GuideScreen } from "@/components/guide/GuideScreen";
import { loadTenantByHost, loadTenantBySlug, toSalonConfig } from "@/lib/salon";

export const dynamic = "force-dynamic";

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headerList = await headers();
  const host = headerList.get("x-tenant-host") || headerList.get("host") || "";
  const tenant = slug === "by-host" ? await loadTenantByHost(host.split(":")[0] || "") : await loadTenantBySlug(slug);
  if (!tenant) notFound();
  return <GuideScreen config={toSalonConfig(tenant)} />;
}
