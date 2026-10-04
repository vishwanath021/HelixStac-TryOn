import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { TryOnApp } from "@/components/tryon/TryOnApp";
import { comparisonChoices } from "@/lib/ai/compare-models";
import { showReferenceToggle } from "@/lib/ai/reference-mode";
import { usingDemoProvider } from "@/lib/env";
import { verifySalonToken } from "@/lib/preview-access";
import { loadTenantByHost, loadTenantBySlug, toSalonConfig } from "@/lib/salon";
import { isSuperSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SalonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tool?: string; style?: string; shade?: string; salon?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const headerList = await headers();
  const host = headerList.get("x-tenant-host") || headerList.get("host") || "";
  const tenant = slug === "by-host" ? await loadTenantByHost(host.split(":")[0] || "") : await loadTenantBySlug(slug);
  if (!tenant) notFound();
  const config = toSalonConfig(tenant);
  const salonMode = verifySalonToken(query.salon || "", tenant.id, tenant.salonNonce);
  const referenceModeAvailable = showReferenceToggle(await isSuperSession());
  return (
    <TryOnApp
      config={config}
      initialTool={query.tool}
      initialStyleId={query.style}
      initialShadeId={query.shade}
      salonToken={salonMode ? query.salon : undefined}
      salonMode={salonMode}
      demoMode={usingDemoProvider()}
      referenceModeAvailable={referenceModeAvailable}
      comparisonModels={referenceModeAvailable ? comparisonChoices() : []}
    />
  );
}
