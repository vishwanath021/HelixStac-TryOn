import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SalonPaused } from "@/components/guest/SalonPaused";
import { brandStyle } from "@/lib/contrast";
import { loadTenantBySlug } from "@/lib/salon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await loadTenantBySlug(slug);
  const name = tenant?.name || "Lookuvi";
  return { title: { absolute: name }, description: `${name}. Join the queue or try a look.` };
}

export default async function SalonWelcome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await loadTenantBySlug(slug);
  if (!tenant) notFound();
  if (tenant.status === "SUSPENDED") return <SalonPaused name={tenant.name} />;
  if (!tenant.productQueue && !tenant.productTryOn && !tenant.productBridal) notFound();
  return (
    <main className="mx-auto max-w-lg px-4 py-10" style={brandStyle(tenant.primaryColor, tenant.accentColor) as CSSProperties}>
      <p className="text-xs uppercase tracking-[0.2em] text-muted">Welcome</p>
      <h1 className="page-title mt-2">{tenant.name}</h1>
      {tenant.address ? <p className="mt-2 text-sm text-muted">{tenant.address}</p> : null}
      <div className="mt-6 grid gap-3">
        {tenant.productQueue ? <Link className="btn w-full text-lg" href={`/s/${tenant.slug}/queue`}>Join queue</Link> : null}
        {tenant.productTryOn || tenant.productBridal ? <Link className="btn secondary w-full text-lg" href={`/s/${tenant.slug}`}>Try a look</Link> : null}
      </div>
    </main>
  );
}
