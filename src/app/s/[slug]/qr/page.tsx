import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SalonPaused } from "@/components/guest/SalonPaused";
import { PrintButton } from "@/components/PrintButton";
import { brandStyle } from "@/lib/contrast";
import { salonWelcomeTarget } from "@/lib/public-url";
import { loadTenantBySlug } from "@/lib/salon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await loadTenantBySlug(slug);
  const name = tenant?.name || "Lookuvi";
  return { title: { absolute: `${name} QR` } };
}

export default async function QrStandee({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await loadTenantBySlug(slug);
  if (!tenant) notFound();
  if (tenant.status === "SUSPENDED") return <SalonPaused name={tenant.name} />;
  if (!tenant.productTryOn && !tenant.productQueue) notFound();
  const target = await salonWelcomeTarget(tenant.id, tenant.slug);
  return (
    <main className="mx-auto max-w-md px-4 py-8 print:max-w-none" style={brandStyle(tenant.primaryColor, tenant.accentColor) as CSSProperties}>
      <article className="card p-8 text-center print:border-0 print:shadow-none">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Join the queue or try a look</p>
        <h1 className="mt-2 page-title">{tenant.name}</h1>
        <p className="mt-2 text-sm text-muted">Scan to open this salon. You can join the queue or try a look. The preview is a guide.</p>
        {target.local ? (
          <p className="mt-6 text-sm" role="alert" data-qr-warning="yes">This QR is not ready to print. The salon address is on this computer, not a real domain. Set the public domain, or verify the salon’s own domain, then print again.</p>
        ) : (
          <>
            <img className="mx-auto mt-6 w-56" src={`/api/v1/qr?slug=${tenant.slug}&format=png`} alt={`QR code for ${tenant.name}`} />
            <p className="mt-4 text-xs break-all" data-qr-url={target.url}>{target.url}</p>
          </>
        )}
        <p className="mt-6 text-sm">{tenant.address}</p>
      </article>
      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
        {target.local ? null : <a className="btn" href={`/api/v1/qr?slug=${tenant.slug}&format=png`}>Download PNG</a>}
        {target.local ? null : <a className="btn secondary" href={`/api/v1/qr?slug=${tenant.slug}&format=svg`}>Download SVG</a>}
        {target.local ? null : <PrintButton label="Print standee" />}
        <Link className="btn ghost" href={`/s/${tenant.slug}/welcome`}>Salon page</Link>
      </div>
    </main>
  );
}
