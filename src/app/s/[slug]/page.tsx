import { headers } from "next/headers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { TryOnApp } from "@/components/tryon/TryOnApp";
import { usingDemoProvider } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { verifySalonToken } from "@/lib/preview-access";
import { loadTenantByHost, loadTenantBySlug, toSalonConfig } from "@/lib/salon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const headerList = await headers();
  const host = headerList.get("x-tenant-host") || headerList.get("host") || "";
  const tenant = slug === "by-host" ? await loadTenantByHost(host.split(":")[0] || "") : await loadTenantBySlug(slug);
  const name = tenant?.name || "Lookuvi";
  return { title: { absolute: name }, description: `${name}. See a haircut on your own photo.` };
}

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
  const session = await auth();
  let demoHint = false;
  if (usingDemoProvider() && session?.user?.id) {
    if (session.user.isSuperAdmin) demoHint = true;
    else {
      const owner = await prisma.membership.findFirst({
        where: { userId: session.user.id, tenantId: tenant.id, role: "OWNER" },
        select: { id: true },
      });
      demoHint = Boolean(owner);
    }
  }
  return (
    <TryOnApp
      config={config}
      initialTool={query.tool}
      initialStyleId={query.style}
      initialShadeId={query.shade}
      salonToken={salonMode ? query.salon : undefined}
      salonMode={salonMode}
      demoHint={demoHint}
    />
  );
}
